import asyncio

from django.core.management.base import BaseCommand

from apps.core.services.sync_service import SyncService


class Command(BaseCommand):
    help = "Backlog API からチケットデータを同期する"

    def handle(self, *args: object, **options: object) -> None:
        self.stdout.write("Starting Backlog sync...")
        asyncio.run(SyncService().sync_all())
        self.stdout.write(self.style.SUCCESS("Sync completed successfully."))
