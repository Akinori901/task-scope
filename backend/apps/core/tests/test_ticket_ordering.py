"""チケット一覧のソート許可列の検証。

DRF の OrderingFilter は許可外の ordering を **黙って捨てて** 既定順に戻す。
そのため ordering_fields の抜けは 500 ではなく「ソートが無反応」という
気づきにくい形で出る。フロントの sortable 列と一致していることを固定する。

issue_key の自然順ソートは MySQL の SUBSTRING_INDEX に依存するため、
実クエリを流す検証はここでは行わない（テストは SQLite）。
"""

from __future__ import annotations

from apps.core.views import TicketExportView, TicketListView

# frontend/src/components/TicketTable.tsx の COLUMNS で sortable: true の列
FRONTEND_SORTABLE = ["issue_key", "summary", "status_name", "priority_name", "due_date"]


class TestOrderingFields:
    def test_一覧はフロントのsortable列を全て許可する(self):
        allowed = set(TicketListView.ordering_fields)
        missing = [f for f in FRONTEND_SORTABLE if f not in allowed]
        assert missing == [], f"ordering_fields に不足: {missing}"

    def test_CSVも一覧と同じ列を許可する(self):
        # 画面と CSV で並びが食い違わないように揃える
        assert set(TicketExportView.ordering_fields) == set(TicketListView.ordering_fields)

    def test_許可列は全てTicketの実カラム(self):
        # シリアライザ専用の派生値を入れると実行時に FieldError になる
        from apps.core.models import Ticket

        real = {f.name for f in Ticket._meta.get_fields()}
        real |= {f.attname for f in Ticket._meta.fields}
        bogus = [f for f in TicketListView.ordering_fields if f not in real]
        assert bogus == [], f"実カラムでない: {bogus}"


class TestIssueKeyNaturalOrder:
    """issue_key は辞書順ではなく課題番号の数値順で並べる。"""

    def test_ordering_mappingでissue_keyを数値列に読み替える(self):
        mapping = TicketListView.ordering_field_mapping
        assert mapping["issue_key"] == ["_key_prefix", "_key_number"]

    def test_CSVも同じ読み替えを行う(self):
        assert TicketExportView.ordering_field_mapping == TicketListView.ordering_field_mapping

    def test_MappedOrderingFilterが降順を全項目に伝播する(self, rf):
        from rest_framework.request import Request

        from apps.core.filters import MappedOrderingFilter

        class _View:
            ordering_fields = ["issue_key"]
            ordering = ["-backlog_updated"]
            ordering_field_mapping = {"issue_key": ["_key_prefix", "_key_number"]}

        f = MappedOrderingFilter()
        asc = f.get_ordering(Request(rf.get("/?ordering=issue_key")), None, _View())
        assert asc == ["_key_prefix", "_key_number"]
        # 降順は展開後の全項目に "-" が付かないと番号だけ昇順になってしまう
        desc = f.get_ordering(Request(rf.get("/?ordering=-issue_key")), None, _View())
        assert desc == ["-_key_prefix", "-_key_number"]

    def test_mappingに無い項目はそのまま通す(self, rf):
        from rest_framework.request import Request

        from apps.core.filters import MappedOrderingFilter

        class _View:
            ordering_fields = ["due_date"]
            ordering = ["-backlog_updated"]
            ordering_field_mapping = {"issue_key": ["_key_prefix", "_key_number"]}

        f = MappedOrderingFilter()
        got = f.get_ordering(Request(rf.get("/?ordering=-due_date")), None, _View())
        assert got == ["-due_date"]
