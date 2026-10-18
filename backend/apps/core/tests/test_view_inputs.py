"""型付けの際に見直した views の入力・分岐の振る舞いを固定する。

- ID の絞り込みに使うクエリパラメータが数字でなければ 400（以前は ORM まで渡って 500）
- 一括投稿は Backlog のチケットだけが対象。Jira のチケットが混ざっても全体を落とさない
- 連携先（Backlog / Jira）の無いプロジェクトへの投稿は 400 で理由を返す
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.core.models import BacklogSpace, Comment, JiraSpace, Project, Ticket

NOW = datetime(2026, 10, 1, tzinfo=UTC)


def _ticket(project: Project, key: str, backlog_id: int) -> Ticket:
    return Ticket.objects.create(
        project=project,
        backlog_id=backlog_id,
        issue_key=key,
        summary="s",
        status_name="未対応",
        backlog_created=NOW,
        backlog_updated=NOW,
    )


def _spec(ticket: Ticket, backlog_id: int) -> Comment:
    return Comment.objects.create(
        ticket=ticket, backlog_id=backlog_id, content="本文", tags=["spec"], source="ai", backlog_created=NOW
    )


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.mark.django_db
class TestIdQueryParams:
    @pytest.mark.parametrize("param", ["space", "jira_space", "project", "assignee"])
    def test_数字でない値は400(self, client: APIClient, param: str) -> None:
        resp = client.get("/api/dashboard/stats/", {param: "abc"})
        assert resp.status_code == 400
        assert param in resp.json()

    def test_数字なら絞り込める(self, client: APIClient) -> None:
        assert client.get("/api/dashboard/stats/", {"space": "1"}).status_code == 200

    def test_空なら絞り込まない(self, client: APIClient) -> None:
        assert client.get("/api/dashboard/stats/", {"space": ""}).status_code == 200

    def test_一覧はdjango_filterが検証して400(self, client: APIClient) -> None:
        # 一覧の絞り込みは TicketFilter（NumberFilter）が元から検証している。揃っていることの確認
        assert client.get("/api/tickets/", {"space": "1;drop"}).status_code == 400


@pytest.mark.django_db
class TestBulkPost:
    def test_Jiraのチケットが混ざっても残りを投稿する(self, client: APIClient) -> None:
        backlog = BacklogSpace.objects.create(space_key="acme", api_key="dummy")
        jira = JiraSpace.objects.create(
            site_name="acme", base_url="https://acme.atlassian.net", user_email="u@example.com", api_token="dummy"
        )
        bp = Project.objects.create(space=backlog, backlog_id=1, project_key="BL", name="bl")
        jp = Project.objects.create(jira_space=jira, backlog_id=2, project_key="JR", name="jr")
        jira_comment = _spec(_ticket(jp, "JR-1", 10), 100)
        backlog_comment = _spec(_ticket(bp, "BL-1", 11), 101)

        with (
            mock.patch("apps.core.services.backlog_client.BacklogClient.post_issue_comment", new=mock.AsyncMock()),
            mock.patch("apps.core.services.backlog_client.BacklogClient.close", new=mock.AsyncMock()),
        ):
            resp = client.post(
                "/api/comments/bulk-post/", {"comment_ids": [jira_comment.pk, backlog_comment.pk]}, format="json"
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["posted"] == 1
        assert any("JR-1" in e and "対象外" in e for e in body["errors"])
        backlog_comment.refresh_from_db()
        jira_comment.refresh_from_db()
        assert backlog_comment.posted_at is not None
        assert jira_comment.posted_at is None


@pytest.mark.django_db
class TestPostWithoutSpace:
    def test_連携先の無いプロジェクトは400(self, client: APIClient) -> None:
        project = Project.objects.create(backlog_id=3, project_key="NO", name="no-space")
        ticket = _ticket(project, "NO-1", 12)
        comment = _spec(ticket, 102)

        resp = client.post(f"/api/tickets/{ticket.pk}/comments/{comment.pk}/post/")

        assert resp.status_code == 400
        assert "連携先" in resp.json()["error"]
        comment.refresh_from_db()
        assert comment.posted_at is None
