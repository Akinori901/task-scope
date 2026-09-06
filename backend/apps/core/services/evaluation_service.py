"""AI によるチケット難易度評価・品質評価サービス

ホスト上の eval-proxy (Claude Code CLI ラッパー) を経由して
サブスクリプション内でAI評価を実行する。
"""

from __future__ import annotations

import json
import logging
import re
from enum import IntEnum
from pathlib import Path

import httpx
from django.conf import settings

from django.utils import timezone as tz

from apps.core.models import CodeRepository, Comment, Ticket, TicketEvaluation


class HttpTimeout(IntEnum):
    """eval-proxy への httpx リクエストのタイムアウト秒数。

    **proxy 側（eval_proxy.ProxyTimeout）より必ず大きくすること。**
    proxy の subprocess timeout（MAX 生成時間 10 分 = 600s）が先に発火して
    claude を確実に終了させてから、backend がレスポンスを受け取れるようにするため、
    proxy + マージン（60s）を確保する。
    """

    # cwd なし（テキストのみ生成）: proxy TEXT(600s) + 60s
    TEXT = 660
    # cwd あり（コードベース探索）: proxy CODE_EXPLORATION(600s) + 60s
    CODE_EXPLORATION = 660

    @classmethod
    def for_request(cls, cwd: str | None) -> float:
        return float(cls.CODE_EXPLORATION if cwd else cls.TEXT)

def resolve_repositories(ticket: Ticket) -> list[CodeRepository]:
    """チケットに紐づくコードリポジトリを解決する（複数返却可能）"""
    repos = list(CodeRepository.objects.filter(project=ticket.project, is_active=True))
    if not repos:
        return []

    matched: list[CodeRepository] = []
    for repo in repos:
        if not repo.match_field:
            # match_field なし → 無条件マッチ
            matched.append(repo)
            continue
        # カスタム属性でマッチング
        for cf in ticket.custom_fields or []:
            if cf.get("name") == repo.match_field:
                val = cf.get("value")
                if isinstance(val, list) and repo.match_value in val:
                    matched.append(repo)
                elif isinstance(val, str) and val == repo.match_value:
                    matched.append(repo)
    return matched


def _format_custom_fields(ticket: Ticket) -> str:
    """カスタム属性をテキスト形式にフォーマットする"""
    if not ticket.custom_fields:
        return ""
    lines: list[str] = []
    for cf in ticket.custom_fields:
        value = cf.get("value", "")
        if isinstance(value, list):
            value = ", ".join(str(v) for v in value)
        lines.append(f"- {cf.get('name', '不明')}: {value}")
    return "\n".join(lines)

logger = logging.getLogger(__name__)

# eval-proxy のベース URL (Docker → ホスト)
EVAL_PROXY_URL = getattr(settings, "EVAL_PROXY_URL", "http://host.docker.internal:19001")

# 方針書ファイル保存先
POLICIES_DIR = Path("/app/docs/policies")

# PR URL を検出する正規表現
PR_URL_PATTERN = re.compile(
    r"https?://(?:github\.com|gitlab\.com|bitbucket\.org)/[^\s)\"'<>]+/pull(?:s|/\d+)[^\s)\"'<>]*"
)


def _extract_pr_urls(ticket: Ticket) -> list[str]:
    """チケット本文 + コメントから PR URL を抽出する"""
    texts = [ticket.description]
    comments = Comment.objects.filter(ticket=ticket).values_list("content", flat=True)
    texts.extend(comments)

    urls: list[str] = []
    for text in texts:
        if text:
            urls.extend(PR_URL_PATTERN.findall(text))

    seen: set[str] = set()
    unique: list[str] = []
    for url in urls:
        if url not in seen:
            seen.add(url)
            unique.append(url)
    return unique


def _call_proxy(endpoint: str, prompt: str, model: str = "sonnet", cwd: str | None = None) -> str:
    """eval-proxy に POST してテキストレスポンスを取得する"""
    payload: dict[str, object] = {"prompt": prompt, "model": model}
    if cwd:
        payload["cwd"] = cwd
    timeout = HttpTimeout.for_request(cwd)
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(
            f"{EVAL_PROXY_URL}{endpoint}",
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["text"]


def _build_evaluation_prompt(ticket: Ticket, comments_text: str) -> str:
    """チケット評価用プロンプト（難易度6軸 + 情報品質）"""
    return f"""あなたは保守開発に精通したシニアエンジニアです。
以下の Backlog チケット情報を分析し、**実装・調整の難易度**と**情報品質**を評価してください。

## チケット情報
- キー: {ticket.issue_key}
- 件名: {ticket.summary}
- 種別: {ticket.issue_type}
- ステータス: {ticket.status_name}
- 優先度: {ticket.priority_name}
- 担当者: {ticket.assignee.name if ticket.assignee else "未割当"}
- 開始日: {ticket.start_date or "未設定"}
- 期限: {ticket.due_date or "未設定"}
- 予定時間: {ticket.estimated_hours or "未設定"}
- 実績時間: {ticket.actual_hours or "未設定"}
- コメント数: {ticket.comment_count}
{f"""
## カスタム属性
{_format_custom_fields(ticket)}""" if ticket.custom_fields else ""}

## 説明
{ticket.description or "(説明なし)"}

## コメント
{comments_text or "(コメントなし)"}

---

以下の JSON 形式のみで回答してください。JSON 以外のテキストは含めないでください。

{{
  "impact_scope_score": <0-100>,
  "query_complexity_score": <0-100>,
  "ambiguity_score": <0-100>,
  "verification_difficulty_score": <0-100>,
  "coordination_cost_score": <0-100>,
  "regression_risk_score": <0-100>,
  "overall_difficulty_score": <0-100>,
  "difficulty_comment": "<難易度に関する補足（2-3文）>",
  "resolution_type": "<data_fix|code_fix|config_change|investigation|mixed|unknown>",
  "resolution_comment": "<対処区分の判断根拠（1-2文）>",
  "estimated_days": <推定工数（人日、小数可）>,
  "estimated_breakdown": [
    {{"phase": "<フェーズ名>", "days": <人日>, "note": "<補足>"}},
    ...
  ],
  "info_completeness_score": <0-100>,
  "missing_items": [<欠損情報の配列>],
  "spec_readiness": "<ready|partial|not_ready>",
  "schedule_feasibility": "<feasible|risky|unrealistic|unknown>",
  "schedule_comment": "<日程に関するコメント>",
  "summary": "<全体評価サマリ（2-3文）>"
}}

---

## 難易度評価の6軸（各 0-100、高い = 難しい/リスク高い）

### 1. impact_scope_score（影響範囲）
変更が波及するシステム・機能の広さ。
- 10: 単純なラベル変更、1画面の表示修正
- 30: 単一テーブル・単一画面の修正
- 50: 複数テーブルや複数画面にまたがる修正
- 70: 外部連携や他システムへの影響あり
- 90: 基幹処理・共通部品への変更

### 2. query_complexity_score（クエリ複雑度）
SQL・データ操作の難しさ。DB・テーブル・SQL・クエリへの言及を探すこと。
- 10: SELECT 1テーブル、単純な CRUD
- 30: 2-3テーブルの JOIN
- 50: 複数テーブル JOIN + 集計・GROUP BY
- 70: サブクエリ、複雑な集計、データ移行
- 90: パフォーマンスチューニング、大量データ処理、複雑なデータ変換

### 3. ambiguity_score（仕様曖昧度）
要件・仕様の不明確さ。コメントでの質疑応答が多い場合は曖昧度が高い証拠。
- 10: 受入条件が明確、手順レベルで記載あり
- 30: 主要要件は明確だが細部は未定
- 50: 方向性は分かるが具体的な仕様は曖昧
- 70: 要件が抽象的で解釈の余地が大きい
- 90: 何をすべきかすら不明確

### 4. verification_difficulty_score（テスト・検証難度）
動作確認・テストの難しさ。
- 10: 目視で即確認可能
- 30: 数パターンのテストデータで確認
- 50: 複数条件の組み合わせテストが必要
- 70: 本番同等のデータが必要、再現条件が複雑
- 90: 本番環境でしか確認できない、回帰テスト範囲が広大

### 5. coordination_cost_score（調整コスト）
他者との調整・確認の手間。コメント参加者数も判断材料にすること。
- 10: 単独で完結
- 30: 1-2名に確認が必要
- 50: チーム内のレビュー・承認が必要
- 70: 他チームや顧客との調整が必要
- 90: 複数部署の承認、顧客との仕様協議が必要

### 6. regression_risk_score（リグレッションリスク）
既存機能を壊すリスク。「既存」「修正」「改修」「共通」等のキーワードに注目。
- 10: 新規追加のみ、既存に影響なし
- 30: 既存画面の軽微な修正
- 50: 既存ロジックの改修
- 70: 共通処理・バッチ処理への変更
- 90: 基幹処理・決済・認証等のクリティカルパスの変更

### overall_difficulty_score（総合難易度）
6軸を踏まえた総合判断。単純平均ではなく、**最もリスクの高い軸を重視**して判断すること。

**重要**: 情報が不足している場合は、安全側（高め）に評価してください。

---

## 対処区分（resolution_type）

チケットの内容から、**どのような種類の作業が必要か**を判定してください。

- **data_fix**: DBのレコード修正・マスタデータ更新で対処可能（SQLの直接実行、管理画面での設定変更など）
  - 例: 権限テーブルのレコード修正、マスタの値更新、データ不整合の修正
- **code_fix**: アプリケーションのソースコード（ロジック・クエリ・画面）の修正が必要
  - 例: バグ修正、機能追加、SQL/クエリの改修、画面の表示修正
- **config_change**: 環境設定・パラメータ・設定ファイルの変更で対処可能
  - 例: 設定値の変更、環境変数の追加、サーバー設定の変更
- **investigation**: 調査・回答のみで実装作業は不要
  - 例: 原因調査、仕様の確認・回答、ログ調査
- **mixed**: 上記の複合（例: データ修正 + コード修正が両方必要）
- **unknown**: 情報不足で判定不可

### 判定のヒント
- 「権限変更」「データ修正」「マスタ」「レコード」等の語 → data_fix の可能性
- 「バグ」「不具合」「エラー」「表示が違う」「動作しない」等 → code_fix の可能性
- 「設定」「パラメータ」「環境」等 → config_change の可能性
- 「確認してほしい」「教えてほしい」「調査」等 → investigation の可能性

---

## 推定工数（estimated_days / estimated_breakdown）

仕様確認・調整・実装・テスト・レビューを含めた **総合的な推定工数（人日）** を算出してください。
フェーズごとの内訳を `estimated_breakdown` に記載してください。

### フェーズの例
- 仕様確認・調整: 要件の明確化、関係者への確認
- 設計: テーブル設計、画面設計、処理フロー
- 実装: コーディング、SQL作成
- テスト: 単体テスト、結合テスト、受入テスト
- レビュー・リリース: コードレビュー、デプロイ作業

### 目安
- 仕様曖昧度が高い → 仕様確認フェーズが長くなる
- 調整コストが高い → 調整フェーズを別途追加
- 検証難度が高い → テストフェーズが長くなる
- 半日単位(0.5日)で見積もること。最小0.5日。

---

## 情報品質評価

### info_completeness_score: チケットの情報充足度 (0-100)
### missing_items: 欠損している情報のリスト
### spec_readiness: 方針書作成可否
- ready: 目的・要件・受入条件が明確で方針書を書き始められる
- partial: 一部不足があるが骨子は作れる
- not_ready: 情報が大幅に不足
### schedule_feasibility: 日程妥当性
- feasible / risky / unrealistic / unknown（期限未設定ならunknown）
### summary: 全体評価サマリ"""


def fetch_skills(local_path: str) -> list[dict]:
    """リポジトリで使えるスキル一覧を eval-proxy 経由で取得する。

    スキルはリポジトリごとに異なるため、生成種別に固定のスキル名を割り当てず
    実在するものを都度拾う。proxy が落ちていても生成自体は続行させたいので、
    失敗時は空リストを返す。
    """
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(f"{EVAL_PROXY_URL}/list-skills", json={"path": local_path})
            resp.raise_for_status()
            return resp.json().get("skills", [])
    except (httpx.HTTPError, ValueError, KeyError):
        logger.warning("スキル一覧の取得に失敗: %s", local_path, exc_info=True)
        return []


def _build_skills_section(repos: list[CodeRepository] | None) -> str:
    """利用可能なスキルをプロンプトに列挙する。

    どのスキルを使うべきかは AI に判断させる。生成種別 → スキル名の固定表を
    持たないのは、リポジトリごとにスキルの顔ぶれ・命名が違うため。
    """
    if not repos:
        return ""

    blocks: list[str] = []
    for repo in repos:
        skills = fetch_skills(repo.local_path)
        if not skills:
            continue
        listed = "\n".join(
            f"  - `{s['name']}`: {s.get('description', '')}"
            # 親ディレクトリ由来（モノレポ共通スキル）は出自を明示する。
            # リポジトリ固有のものを優先して選ばせたいため。
            + ("" if s.get("origin", "self") == "self" else "  ※共通スキル")
            for s in skills
        )
        blocks.append(f"- **{repo.name}** ({repo.local_path}):\n{listed}")

    if not blocks:
        return ""

    return """

## 利用可能なスキル
対象リポジトリには、そのリポジトリの作法に合わせて作られた既存スキルがあります。
**今回の生成内容に合致するスキルがあれば Skill ツールで実行し、その手順・出力形式に従ってください。**
（例: 方針書を作るなら方針書用スキル、調査ならコード調査用スキル）
合致するスキルが無ければ、通常どおりコードを読んで生成してください。

**重要**: ファイル書き込みは許可されていません（保存は task-scope 側で行います）。
スキルが docs/ 等への保存を指示していても**書き込もうとせず**、生成物を本文として
そのまま出力してください。「保存できませんでした」等の断り書きも不要です。
また、前置き・作業経過の説明は書かず、**成果物の本文だけ**を日本語で出力してください。

""" + "\n".join(blocks)


def _build_spec_prompt(ticket: Ticket, comments_text: str, repos: list[CodeRepository] | None = None) -> str:
    """方針書生成用のプロンプトを構築する"""
    return f"""以下の Backlog チケット情報を元に、実装方針書（設計ドキュメント）を作成してください。

## チケット情報
- キー: {ticket.issue_key}
- 件名: {ticket.summary}
- 種別: {ticket.issue_type}
- ステータス: {ticket.status_name}
- 優先度: {ticket.priority_name}
- 担当者: {ticket.assignee.name if ticket.assignee else "未割当"}
- 開始日: {ticket.start_date or "未設定"}
- 期限: {ticket.due_date or "未設定"}
{f"""
## カスタム属性
{_format_custom_fields(ticket)}""" if ticket.custom_fields else ""}

## 説明
{ticket.description or "(説明なし)"}

## コメント
{comments_text or "(コメントなし)"}

## 出力形式
Markdown 形式で以下の構成で方針書を作成してください。

# 方針書: {ticket.issue_key} {ticket.summary}

## 1. 概要
チケットの目的と背景を簡潔にまとめる

## 2. 現状分析
現在の状態と課題を整理する

## 3. 対応方針
### 3.1 アプローチ
具体的な実装アプローチ

### 3.2 影響範囲
変更が影響する範囲の特定

### 3.3 リスクと対策
想定されるリスクとその対策

## 4. 実装計画
### 4.1 タスク分解
具体的な作業ステップ

### 4.2 スケジュール
作業の順序と見積もり

## 5. 受入条件
完了の定義と確認事項

## 6. 備考
チケットの情報から読み取れない点や確認が必要な事項""" + _build_code_reference_section(repos)


def _build_code_reference_section(repos: list[CodeRepository] | None) -> str:
    """コードリポジトリがある場合、プロンプトにコード参照指示を追加する"""
    if not repos:
        return ""
    repo_list = "\n".join(
        f"- **{r.name}**: {r.local_path}" + (f" ({r.description})" if r.description else "")
        for r in repos
    )
    return f"""

---

## コードベース参照
このチケットに関連するコードベースにアクセスできます。

{repo_list}

方針書を作成する際、以下の手順でコードを調査してください:
1. チケットの説明・コメントからキーワードを抽出
2. Grep/Glob でコードベース内の関連ファイルを検索
3. 見つかったファイルを Read で確認し、既存のコード構造を把握
4. コードの構造を理解した上で、**具体的な変更対象ファイルと実装方針**を記載

※ 全ファイルを読む必要はありません。チケットに関連する部分のみ調査してください。
※ 複数リポジトリがある場合、それぞれの絶対パスで参照してください。
※ 方針書の「3. 対応方針」「4. 実装計画」にはコードから読み取った具体的なファイルパス・クラス名・メソッド名を含めてください。
※ git log / git blame で該当箇所の変更経緯を確認すると精度が上がります。""" + _build_skills_section(
        repos
    )


def _get_comments_text(ticket: Ticket) -> str:
    """チケットのコメントをテキスト形式で取得する（変化ログとタグ付きコメントは除外）"""
    comments = (
        Comment.objects.filter(ticket=ticket, tags=[])
        .exclude(content="")
        .select_related("created_user")
        .order_by("backlog_created")
    )
    parts: list[str] = []
    for c in comments[:30]:
        author = c.created_user.name if c.created_user else "不明"
        parts.append(f"[{author} {c.backlog_created}]\n{c.content}")
    return "\n---\n".join(parts)


def evaluate_ticket(ticket: Ticket) -> TicketEvaluation:
    """チケットを AI で評価し、結果を保存する"""
    comments_text = _get_comments_text(ticket)
    pr_urls = _extract_pr_urls(ticket)

    prompt = _build_evaluation_prompt(ticket, comments_text)
    response_text = _call_proxy("/evaluate", prompt)

    # レスポンスから JSON を抽出
    json_match = re.search(r"\{[\s\S]*\}", response_text)
    if not json_match:
        raise ValueError(f"AI response did not contain valid JSON: {response_text[:200]}")

    result = json.loads(json_match.group())

    evaluation, _ = TicketEvaluation.objects.update_or_create(
        ticket=ticket,
        defaults={
            # 難易度6軸
            "impact_scope_score": result.get("impact_scope_score", 0),
            "query_complexity_score": result.get("query_complexity_score", 0),
            "ambiguity_score": result.get("ambiguity_score", 0),
            "verification_difficulty_score": result.get("verification_difficulty_score", 0),
            "coordination_cost_score": result.get("coordination_cost_score", 0),
            "regression_risk_score": result.get("regression_risk_score", 0),
            "overall_difficulty_score": result.get("overall_difficulty_score", 0),
            "difficulty_comment": result.get("difficulty_comment", ""),
            # 対処区分
            "resolution_type": result.get("resolution_type", "unknown"),
            "resolution_comment": result.get("resolution_comment", ""),
            # 推定工数
            "estimated_days": result.get("estimated_days", 0),
            "estimated_breakdown": result.get("estimated_breakdown", []),
            # 情報品質
            "info_completeness_score": result.get("info_completeness_score", 0),
            "missing_items": result.get("missing_items", []),
            "spec_readiness": result.get("spec_readiness", "not_ready"),
            "schedule_feasibility": result.get("schedule_feasibility", "unknown"),
            "schedule_comment": result.get("schedule_comment", ""),
            "summary": result.get("summary", ""),
            "pr_urls": pr_urls,
            "comment_count_at_eval": Comment.objects.filter(ticket=ticket).exclude(content="").count(),
            "model_used": "claude-sonnet (via subscription)",
        },
    )

    # 方針書作成可能なら自動生成
    if result.get("spec_readiness") == "ready":
        generate_spec(ticket, comments_text)

    return evaluation


def _build_qa_prompt(ticket: Ticket, comments_text: str, repos: list[CodeRepository] | None = None) -> str:
    """QA テスト項目生成用のプロンプトを構築する"""
    return f"""あなたは品質保証(QA)に精通したテストエンジニアです。
以下の Backlog チケット情報を元に、**QA テスト項目リスト**を作成してください。

## チケット情報
- キー: {ticket.issue_key}
- 件名: {ticket.summary}
- 種別: {ticket.issue_type}
- ステータス: {ticket.status_name}
- 優先度: {ticket.priority_name}
- 担当者: {ticket.assignee.name if ticket.assignee else "未割当"}
{f'''
## カスタム属性
{_format_custom_fields(ticket)}''' if ticket.custom_fields else ""}

## 説明
{ticket.description or "(説明なし)"}

## コメント
{comments_text or "(コメントなし)"}

---

## 出力要件
チケットの内容から、受入確認・回帰確認に必要なテスト項目を網羅的に洗い出してください。

- チケット説明にテストケース（条件分岐・期待結果など）が記載されている場合は、それを **漏れなく** 項目化すること
- 正常系だけでなく、境界値・異常系・エラーケースも含めること
- 各項目は QA 担当者がそのまま手順を実行できる粒度で記述すること
- 「テスト観点」は項目をグルーピングするカテゴリ名（例: 過剰時の実投入時間表示、不足時の差異表示 など）

以下の JSON 形式のみで回答してください。JSON 以外のテキスト（説明文・コードフェンス等）は一切含めないでください。

{{
  "qa_items": [
    {{
      "category": "<テスト観点（カテゴリ名）>",
      "precondition": "<前提条件・テストデータ>",
      "steps": "<テスト手順（複数行は \\n で区切る）>",
      "expected": "<期待結果>",
      "note": "<備考（任意・無ければ空文字）>"
    }}
  ]
}}

- 項目数の上限はありません。網羅性を最優先してください。
- 同じ category が複数項目にまたがってよい（手順ごとに1項目）。""" + _build_code_reference_section(repos)


# ローカル生成コメント（Backlog 由来でないもの）に割り当てる backlog_id の下限。
# Comment には UniqueConstraint(ticket, backlog_id) があるため、AI 生成物を
# 常に backlog_id=0 で作ると **同一チケットで 2 回目以降の生成が必ず失敗する**
# （再生成は通常操作なので致命的）。実際の Backlog コメント ID は現状 10^15 前後
# なので、それより十分小さい 1..LOCAL_COMMENT_ID_BASE の帯を衝突しない
# ローカル採番用に使う。0 は既存データが使っているので温存する。
LOCAL_COMMENT_ID_BASE = 1_000_000


def _next_local_backlog_id(ticket: Ticket) -> int:
    """同一チケット内で未使用のローカル採番 backlog_id を返す。"""
    used = set(
        Comment.objects.filter(ticket=ticket, backlog_id__lt=LOCAL_COMMENT_ID_BASE)
        .values_list("backlog_id", flat=True)
    )
    candidate = 1
    while candidate in used:
        candidate += 1
    return candidate


def _create_ai_comment(ticket: Ticket, content: str, tags: list[str]) -> Comment:
    """AI 生成物を Comment として保存する（再生成しても衝突しない）。"""
    return Comment.objects.create(
        ticket=ticket,
        backlog_id=_next_local_backlog_id(ticket),
        content=content,
        tags=tags,
        source="ai",
        backlog_created=tz.now(),
    )


def generate_qa_items(ticket: Ticket, comments_text: str | None = None) -> tuple[list[dict], Comment]:
    """チケットから QA テスト項目を生成する → qa タグ付き Comment（JSON）として保存

    Returns: (qa_items のリスト, 保存した Comment)
    """
    if comments_text is None:
        comments_text = _get_comments_text(ticket)

    repos = resolve_repositories(ticket)
    cwd = repos[0].local_path if repos else None
    prompt = _build_qa_prompt(ticket, comments_text, repos)
    model = "opus" if cwd else "sonnet"
    response_text = _call_proxy("/generate-qa", prompt, model=model, cwd=cwd)

    # レスポンスから JSON を抽出
    json_match = re.search(r"\{[\s\S]*\}", response_text)
    if not json_match:
        raise ValueError(f"AI response did not contain valid JSON: {response_text[:200]}")

    result = json.loads(json_match.group())
    raw_items = result.get("qa_items", [])
    if not isinstance(raw_items, list):
        raise ValueError("AI response 'qa_items' was not a list")

    # 各フィールドを文字列に正規化する。
    # モデルが steps を配列（手順のリスト）で返すことがあるため、改行区切りの
    # 文字列に変換する。フロントの Excel 生成は文字列前提のため、ここで吸収する。
    def _to_text(value: object) -> str:
        if isinstance(value, list):
            return "\n".join(str(v) for v in value)
        if value is None:
            return ""
        return str(value)

    qa_items = [
        {
            "category": _to_text(item.get("category")),
            "precondition": _to_text(item.get("precondition")),
            "steps": _to_text(item.get("steps")),
            "expected": _to_text(item.get("expected")),
            "note": _to_text(item.get("note")),
        }
        for item in raw_items
        if isinstance(item, dict)
    ]
    # 正規化済みのデータを保存内容にも反映する
    result["qa_items"] = qa_items

    comment = _create_ai_comment(
        ticket, json.dumps(result, ensure_ascii=False, indent=2), ["qa"]
    )

    return qa_items, comment


def generate_spec(ticket: Ticket, comments_text: str | None = None) -> Comment:
    """チケットから方針書を生成する（Opus モデル使用）→ spec タグ付き Comment として保存"""
    if comments_text is None:
        comments_text = _get_comments_text(ticket)

    repos = resolve_repositories(ticket)
    cwd = repos[0].local_path if repos else None
    prompt = _build_spec_prompt(ticket, comments_text, repos)
    content = _call_proxy("/generate-spec", prompt, model="opus", cwd=cwd)

    comment = _create_ai_comment(ticket, content, ["spec"])

    # ファイルにも保存
    try:
        POLICIES_DIR.mkdir(parents=True, exist_ok=True)
        file_path = POLICIES_DIR / f"{ticket.issue_key}.md"
        file_path.write_text(content, encoding="utf-8")
        logger.info("Spec saved to %s", file_path)
    except OSError:
        logger.warning("Failed to save spec file for %s", ticket.issue_key, exc_info=True)

    return comment


def _write_doc_file(out_dir: Path, ticket: Ticket, content: str, kind: str) -> None:
    """生成物をローカル docs に保存する（失敗しても本処理は止めない）。"""
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{ticket.issue_key}.md"
        path.write_text(content, encoding="utf-8")
        logger.info("%s saved to %s", kind, path)
    except OSError:
        logger.warning("Failed to save %s for %s", kind, ticket.issue_key, exc_info=True)


def _build_ticket_header(ticket: Ticket, comments_text: str) -> str:
    """各生成プロンプト共通のチケット情報ヘッダ（説明・コメントを含む）"""
    return f"""## チケット情報
- キー: {ticket.issue_key}
- 件名: {ticket.summary}
- 種別: {ticket.issue_type}
- ステータス: {ticket.status_name}
- 優先度: {ticket.priority_name}
- 担当者: {ticket.assignee.name if ticket.assignee else "未割当"}
- 開始日: {ticket.start_date or "未設定"}
- 期限: {ticket.due_date or "未設定"}
{f'''
## カスタム属性
{_format_custom_fields(ticket)}''' if ticket.custom_fields else ""}

## 説明
{ticket.description or "(説明なし)"}

## コメント
{comments_text or "(コメントなし)"}"""


def _build_report_prompt(ticket: Ticket, comments_text: str, repos: list[CodeRepository] | None = None) -> str:
    """調査報告書生成用のプロンプトを構築する"""
    header = _build_ticket_header(ticket, comments_text)
    return f"""以下の Backlog チケット情報と（あれば）関連コードを元に、**調査報告書**を作成してください。
不具合・問い合わせの原因を技術的に調査し、根本原因と対処案を報告する文書です。

{header}

## 出力形式
Markdown 形式で以下の構成で作成してください。

# 調査報告書: {ticket.issue_key} {ticket.summary}

## 1. 調査依頼の概要
何を調査したか、依頼の背景

## 2. 事象・再現条件
発生している事象、再現手順・条件

## 3. 調査内容
確認した箇所（コード・データ・設定）と、その結果わかった事実

## 4. 原因
根本原因の特定（推定の場合はその旨と根拠）

## 5. 対処方針
恒久対応・暫定対応の案。影響範囲とリスク

## 6. 未確認事項・要確認
情報不足で判断できない点、依頼者・関係者に確認すべき事項""" + _build_code_reference_section(repos)


def _build_plan_prompt(ticket: Ticket, comments_text: str, repos: list[CodeRepository] | None = None) -> str:
    """実装計画書生成用のプロンプトを構築する"""
    header = _build_ticket_header(ticket, comments_text)
    return f"""以下の Backlog チケット情報と（あれば）関連コードを元に、**実装計画書**を作成してください。
実際に手を動かす前提で、変更対象と手順を具体化した文書です。

{header}

## 出力形式
Markdown 形式で以下の構成で作成してください。

# 実装計画書: {ticket.issue_key} {ticket.summary}

## 1. 目的
この実装で達成すること

## 2. 変更対象
修正・追加するファイル/モジュール/テーブル（関連コードがあれば具体的なパスで）

## 3. 実装手順
着手順に番号付きで。各ステップの作業内容

## 4. 影響範囲と考慮点
既存機能への影響、後方互換、データ移行の要否

## 5. テスト計画
確認すべき正常系・異常系。回帰確認の範囲

## 6. リスクとロールバック
想定リスクと、問題時の切り戻し方針""" + _build_code_reference_section(repos)


def _build_record_prompt(ticket: Ticket, comments_text: str, repos: list[CodeRepository] | None = None) -> str:
    """実装/実行記録生成用のプロンプトを構築する"""
    header = _build_ticket_header(ticket, comments_text)
    return f"""以下の Backlog チケット情報と（あれば）関連コードを元に、**実装/実行記録**のドラフトを作成してください。
実施した作業の記録として残す文書です。コメント等から読み取れる実施内容を整理し、
不明な部分は「（要記入）」として枠だけ用意してください。

{header}

## 出力形式
Markdown 形式で以下の構成で作成してください。

# 実装/実行記録: {ticket.issue_key} {ticket.summary}

## 1. 実施内容
実際に行った作業（コメント・説明から読み取れる範囲で。不明なら「（要記入）」）

## 2. 変更点
修正したファイル・データ・設定の一覧

## 3. 実行手順・コマンド
実行した手順や適用コマンド（判明している範囲で）

## 4. 確認結果
動作確認・テストの結果

## 5. 残課題・申し送り
未完了事項、次工程への引き継ぎ""" + _build_code_reference_section(repos)


def _build_completion_prompt(ticket: Ticket, comments_text: str, repos: list[CodeRepository] | None = None) -> str:
    """完了コメント生成用のプロンプトを構築する"""
    header = _build_ticket_header(ticket, comments_text)
    return f"""以下の Backlog チケット情報を元に、依頼者へ返す**完了コメント**のドラフトを作成してください。
対応が完了したことを依頼者に報告する、丁寧でわかりやすい文面です。

{header}

## 出力要件
- 依頼者（技術者でない場合もある）に伝わる、丁寧な日本語の文面にする
- 「対応した内容」「結果どうなったか」「依頼者に確認・お願いしたいこと」を簡潔に含める
- チケットの説明・コメントから読み取れない具体値（金額・件数・日付など）は「（要確認）」と明示し、断定しない
- Markdown の見出しは不要。そのまま Backlog コメントに貼れる本文のみを出力する
- 署名や宛名のテンプレート（「〇〇様」等）は先頭に付けてよい"""


# ドキュメント系の生成物はローカル docs にもファイル保存する（方針書 POLICIES_DIR と同様）。
# ルートは方針書と揃えて /app/docs 配下（Docker で docs をローカルにマウントしている前提）。
DOCS_ROOT = POLICIES_DIR.parent  # /app/docs

# 生成種別 → (プロンプトビルダ, proxy エンドポイント, コメントタグ, docs サブディレクトリ名)
# docs_subdir が None の種別（完了コメント）はファイル保存しない（Backlog コメント下書きのため）。
_GENERATION_KINDS = {
    "survey": (_build_report_prompt, "/generate-report", "survey", "surveys"),
    "plan": (_build_plan_prompt, "/generate-plan", "plan", "plans"),
    "record": (_build_record_prompt, "/generate-record", "record", "records"),
    "completion": (_build_completion_prompt, "/generate-completion", "completion", None),
}


def generate_document(ticket: Ticket, kind: str, comments_text: str | None = None) -> Comment:
    """調査報告書 / 実装計画書 / 実装記録 / 完了コメント を生成し、対応タグ付き Comment を保存する。

    kind: "survey" | "plan" | "record" | "completion"
    方針書(generate_spec)と同じく eval-proxy 経由でサブスクリプション内 AI を使う。
    ドキュメント系（survey/plan/record）はローカル docs にもファイル保存する。
    """
    if kind not in _GENERATION_KINDS:
        raise ValueError(f"Unknown generation kind: {kind}")
    build_prompt, endpoint, tag, docs_subdir = _GENERATION_KINDS[kind]

    if comments_text is None:
        comments_text = _get_comments_text(ticket)

    repos = resolve_repositories(ticket)
    cwd = repos[0].local_path if repos else None
    prompt = build_prompt(ticket, comments_text, repos)

    content = _call_proxy(endpoint, prompt, model="opus", cwd=cwd)

    comment = _create_ai_comment(ticket, content, [tag])

    if docs_subdir:
        _write_doc_file(DOCS_ROOT / docs_subdir, ticket, content, kind)

    return comment
