class AppGlobals:
    bronze_container: str = "bronze"
    silver_container: str = "silver"
    gold_container: str = "gold"
    checkpoint_container: str = "checkpoints"
    subdomain: str = "benefits"
    landing_container: str = "landing"

    def __init__(self, env: str = "test", slot: str = None):
        assert len(env) > 0
        self._env = env
        self._slot = slot

    @property
    def secret_scope(self):
        return f"benefits_secret_scope{self._slot}"

    @property
    def bazop_catalog_name(self):
        return f"upcoop_share_bazop_datafab_{self._env}"

    @property
    def benefits_catalog_name(self):
        return f"upcoop_benefits_fabrik_{self._env}"

    @property
    def bazop_database_name(self):
        return "bazop"

    @property
    def benefits_bronze_database_name(self):
        return "benefits_bronze"

    @property
    def benefits_silver_database_name(self):
        return "benefits_silver"

    @property
    def bazop_operations_table_name(self):
        return f"{self.bazop_catalog_name}.{self.bazop_database_name}.operations"

    @property
    def bazop_events_table_name(self):
        return f"{self.bazop_catalog_name}.{self.bazop_database_name}.events"

    @property
    def benefits_bronze_cards_headers_table_name(self):
        return f"{self.benefits_catalog_name}.{self.benefits_bronze_database_name}.df11_cardlist_headers"

    @property
    def benefits_bronze_cards_table_name(self):
        return f"{self.benefits_catalog_name}.{self.benefits_bronze_database_name}.df11_cardlist"

    @property
    def benefits_bronze_beneficiaryaccountbalance_table_name(self):
        return f"{self.benefits_catalog_name}.{self.benefits_bronze_database_name}.df17_beneficiaryaccountbalance"

    @property
    def benefits_bronze_beneficiaryaccountbalance_headers_table_name(self):
        return (
            f"{self.benefits_catalog_name}.{self.benefits_bronze_database_name}.df17_beneficiaryaccountbalance_headers"
        )

    @property
    def benefits_silver_cards_table_name(self):
        return f"{self.benefits_catalog_name}.{self.benefits_silver_database_name}.cards"

    @property
    def benefits_silver_beneficiaryaccountbalance_table_name(self):
        return f"{self.benefits_catalog_name}.{self.benefits_silver_database_name}.beneficiaryaccountbalance"

    @property
    def monetics_silver_beneficiaryaccountbalance_table_name(self):
        return "upcoop_monetics_fabrik_prod.moveup_silver.df17_b_beneficiaryaccountbalance_cdj"
