"""Backlog / Jira の同期の起動"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from django.db import close_old_connections
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.services.sync_service import SyncService

if TYPE_CHECKING:
    from rest_framework.request import Request


logger = logging.getLogger(__name__)


class SyncTriggerView(APIView):
    """同期トリガー API（全スペース or 指定スペース）"""

    def post(self, request: Request) -> Response:
        space_id = request.data.get("space_id")
        try:
            close_old_connections()
            service = SyncService()
            if space_id:
                asyncio.run(service.sync_space(int(space_id)))
            else:
                asyncio.run(service.sync_all())
            close_old_connections()
            return Response({"status": "ok", "message": "Sync completed"})
        except ValueError as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("Sync failed")
            return Response(
                {"status": "error", "message": "Sync failed"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class JiraSyncTriggerView(APIView):
    """Jira 同期トリガー API（指定スペース）"""

    def post(self, request: Request, pk: int) -> Response:
        from apps.core.services.jira_sync_service import JiraSyncService

        try:
            close_old_connections()
            service = JiraSyncService()
            asyncio.run(service.sync_space(pk))
            close_old_connections()
            return Response({"status": "ok", "message": "Jira sync completed"})
        except ValueError as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("Jira sync failed")
            return Response(
                {"status": "error", "message": "Jira sync failed"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
