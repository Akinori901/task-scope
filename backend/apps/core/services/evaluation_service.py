"""AI によるチケット難易度評価・品質評価サービス

ホスト上の eval-proxy (Claude Code CLI ラッパー) を経由して
サブスクリプション内でAI評価を実行する。
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

import httpx
from django.conf import settings

from django.utils import timezone as tz

from apps.core.models import CodeRepository, Comment, Ticket, TicketEvaluation

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
    timeout = 660.0 if cwd else 360.0
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
※ 方針書の「3. 対応方針」「4. 実装計画」にはコードから読み取った具体的なファイルパス・クラス名・メソッド名を含めてください。"""


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


def generate_spec(ticket: Ticket, comments_text: str | None = None) -> Comment:
    """チケットから方針書を生成する（Opus モデル使用）→ spec タグ付き Comment として保存"""
    if comments_text is None:
        comments_text = _get_comments_text(ticket)

    repos = resolve_repositories(ticket)
    cwd = repos[0].local_path if repos else None
    prompt = _build_spec_prompt(ticket, comments_text, repos)
    content = _call_proxy("/generate-spec", prompt, model="opus", cwd=cwd)

    comment = Comment.objects.create(
        ticket=ticket,
        backlog_id=0,
        content=content,
        tags=["spec"],
        source="ai",
        backlog_created=tz.now(),
    )

    # ファイルにも保存
    try:
        POLICIES_DIR.mkdir(parents=True, exist_ok=True)
        file_path = POLICIES_DIR / f"{ticket.issue_key}.md"
        file_path.write_text(content, encoding="utf-8")
        logger.info("Spec saved to %s", file_path)
    except OSError:
        logger.warning("Failed to save spec file for %s", ticket.issue_key, exc_info=True)

    return comment
