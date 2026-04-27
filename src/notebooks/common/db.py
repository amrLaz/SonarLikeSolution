from dataclasses import dataclass
from functools import cached_property, wraps
from typing import Callable

from delta.tables import DeltaTable
from pyspark.sql import SparkSession

from .app_globals import AppGlobals
from pyspark.sql.types import (
    ArrayType,
    BooleanType,
    DoubleType,
    IntegerType,
    LongType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)


def delta_domain(domain_name: str, location: str):
    def wrapper(cls):
        class Klass(cls):
            _domain = domain_name
            _location = location

            @wraps(cls, updated=())
            def __init__(self, *args, **kargs):
                super(Klass, self).__init__(*args, **kargs)
                self.get_delta_table_location = self.__get_delta_table_location()
                self.get_check_point_location = self.__get_check_point_location()

            def __get_delta_table_location(self) -> Callable[[str, str, str], str]:
                return lambda container, sub_domain, table_name: self._location.format(
                    storage_account_name=self._storage_account_name,
                    domain=self._domain,
                    sub_domain=sub_domain,
                    table_name=Klass._resolve_table_name(table_name),
                    container=container,
                )

            def __get_check_point_location(self) -> Callable[[str, str, str, str], str]:
                return (
                    lambda container, sub_domain, table_name, checkpoint_name: self._location.format(
                        storage_account_name=self._storage_account_name,
                        domain=self._domain,
                        sub_domain=sub_domain,
                        table_name=Klass._resolve_table_name(table_name),
                        container=container,
                    )
                    + f"_checkpoint/{checkpoint_name}"
                )

            @staticmethod
            def _resolve_table_name(full_table_name: str) -> str:
                if "." not in full_table_name:
                    return full_table_name
                return full_table_name.split(".")[-1]

            def _resolve_root_location(self, container: str, full_table_name: str) -> str:
                location: str = self.__get_delta_table_location()(container, full_table_name)
                return (
                    location[0 : location.index(self._domain) + len(self._domain)]
                    + "/"
                    + Klass._resolve_table_name(full_table_name)
                )

        return Klass

    return wrapper


@delta_domain(
    domain_name="Benefits",
    location="abfss://{container}@{storage_account_name}.dfs.core.windows.net/{domain}/{sub_domain}/{table_name}/Table/",
)
@dataclass(init=False)
class DeltaTables:
    _spark: SparkSession
    _storage_account_name: str
    _globals: AppGlobals

    def __init__(self, spark: SparkSession, storage_account_name: str, app_globals: AppGlobals) -> None:
        self._spark = spark
        self._storage_account_name = storage_account_name
        self._globals = app_globals

    @cached_property
    def bazop_operations_delta_table(self):
        return DeltaTable.forName(self._spark, self._globals.bazop_operations_table_name)

    @cached_property
    def bazop_events_delta_table(self):
        return DeltaTable.forName(self._spark, self._globals.bazop_events_table_name)

    @cached_property
    def cards_silver_delta_table(self):
        return DeltaTable.forName(self._spark, self._globals.benefits_silver_cards_table_name)

    @cached_property
    def beneficiaryaccountbalance_silver_delta_table(self):
        return _init_beneficiaryaccountbalance_silver_delta_table(
            self._spark, self._globals, self.get_delta_table_location
        )

    @cached_property
    def cards_bronze_delta_table(self):
        return _init_cards_bronze_delta_table(self._spark, self._globals, self.get_delta_table_location)

    @cached_property
    def cards_headers_bronze_delta_table(self):
        return _init_cards_headers_bronze_delta_table(self._spark, self._globals, self.get_delta_table_location)

    @cached_property
    def beneficiaryaccountbalance_bronze_delta_table(self):
        return _init_beneficiaryaccountbalance_bronze_delta_table(
            self._spark, self._globals, self.get_delta_table_location
        )

    @cached_property
    def beneficiaryaccountbalance_headers_bronze_delta_table(self):
        return _init_beneficiaryaccountbalance_headers_bronze_delta_table(
            self._spark, self._globals, self.get_delta_table_location
        )


def _init_cards_headers_bronze_delta_table(
    spark: SparkSession, app_globals: AppGlobals, get_location_func: Callable[[str, str, str], str]
) -> DeltaTable:
    return (
        DeltaTable.createIfNotExists(spark)
        .tableName(app_globals.benefits_bronze_cards_headers_table_name)
        .addColumn(
            colName="fileDate",
            dataType=TimestampType(),
            comment="Date de création du fichier par le Producteur, au format ISO 8601. \n\nExprimée dans le fuseau horaire de la plateforme Producteur MoveUp.",
            nullable=False,
        )
        .addColumn(
            colName="fileId",
            dataType=IntegerType(),
            comment="Identifiant du fichier, unique sur 3 mois glissants pour le distributeur concerné. \n\n \n\nOn pourra convenir d’un identifiant numérique, valorisé à 1 pour le tout premier fichier, puis incrémenté de 1 à chaque nouveau fichier.",
            nullable=False,
        )
        .addColumn(
            colName="nbrItems", dataType=IntegerType(), comment="Nombre d’enregistrements détail", nullable=False
        )
        .addColumn(
            colName="distributorRef",
            dataType=StringType(),
            comment="Référence du Distributeur pour lequel l’extraction est générée.",
            nullable=False,
        )
        .addColumn(
            colName="interfaceVersion",
            dataType=IntegerType(),
            comment="Version de l’interface. \n\nValorisée à partir de la version 2 et dans les versions suivantes. \n\nAbsente dans la version 1.",
        )
        .comment("Table des entêtes de fichiers de cartes")
        .location(
            get_location_func(
                app_globals.bronze_container, "Cards", app_globals.benefits_bronze_cards_headers_table_name
            )
        )
        .property("delta.enableChangeDataFeed", "true")
        .execute()
    )


def _init_cards_bronze_delta_table(
    spark: SparkSession, app_globals: AppGlobals, get_location_func: Callable[[str, str, str], str]
) -> DeltaTable:
    return (
        DeltaTable.createIfNotExists(spark)
        .tableName(app_globals.benefits_bronze_cards_table_name)
        .addColumn(
            colName="_cardId",
            dataType=StringType(),
            comment="Référence externe de la carte. \n\nAbsente lorsqu’une demande d’action porte sur une carte inconnue, présente sinon.",
        )
        .addColumn(
            colName="_pan",
            dataType=StringType(),
            comment="Numéro de la carte en clair ou masqué selon le choix du Distributeur (DIF-1) : \n\n- en clair  entre 16 et 19 caractères numériques, \n\n- masqué :  \n\nles 6 premiers et les 4 derniers caractères du PAN restent en clair, \n\nles autres caractères du PAN sont remplacés par le caractère précisé dans le paramètre DIF-1. \n\nExemple : 123456******1234 si DIF-1 contient ‘*’. \n\nAbsent lorsqu’une demande d’action porte sur une carte inconnue, présente sinon. \n\n \n\nAbsent pour une demande de réédition de code PIN par WS vers un serveur de PIN digital",
        )
        .addColumn(colName="_psn", dataType=StringType(), comment="")
        .addColumn(
            colName="_expiryDate",
            dataType=StringType(),
            comment="Date d’expiration de la carte. \n\nAbsente lorsqu’une demande d’action porte sur une carte inconnue, présente sinon.. \n\n \n\nAbsente pour une demande de réédition de code PIN par WS vers un serveur de PIN digital",
        )
        .addColumn(colName="productRef", dataType=StringType(), comment="Référence du Produit Commercial.")
        .addColumn(
            colName="funderContractRef",
            dataType=StringType(),
            comment="Présent si la carte est rattachée à un service bénéficiaire ou bien si la carte est une carte stock créée pour un financeur.",
        )
        .addColumn(
            colName="beneficiaryServiceRef",
            dataType=StringType(),
            comment="Présent si la carte est rattachée à un service bénéficiaire. \n\nSera absent pour les cartes stock non encore assignée à un service bénéficiaire.",
        )
        .addColumn(
            colName="embossingName",
            dataType=StringType(),
            comment="Nom d’embossage : nom et prénoms embossés ou imprimés sur l’équipement",
        )
        .addColumn(
            colName="funderName",
            dataType=StringType(),
            comment="Utilisé pour inscrire le nom du financeur sur l’équipement",
        )
        .addColumn(
            colName="issuingDate",
            dataType=TimestampType(),
            comment="Date de fabrication de l’équipement \n\nExprimée dans le fuseau horaire du distributeur si paramètre  distributeur DIF-3 « Timezone » renseigné, dans le fuseau horaire de la plateforme Producteur MoveUp sinon. \n\nCette date est non renseignée si la carte a été créée sans support.",
        )
        .addColumn(
            colName="cardSupportType",
            dataType=StringType(),
            comment="Support de la carte \n\nCe champ peut prendre les valeurs : \n\nDIGITAL \n\nPHYSICAL \n\nSi la carte a été créée avec support (via DF8-B1), alors cette donnée = « PHYSICAL » \n\nSi la carte a été créée sans support (via DF8-B1 ou WS – create DigitalCard, alors cette donnée = « DIGITAL » \n\nSi la carte est ensuite créée physiquement (via DF8-B5 ou WS – créatePhysicalCard), alors cette donnée = « PHYSICAL »",
        )
        .addColumn(
            colName="deferredCreationDate",
            dataType=StringType(),
            comment="Si la carte a été créée sans support, contient la date de création de la carte dans le référentiel carte. Exprimée dans le fuseau horaire du distributeur si paramètre  distributeur DIF-3 « Timezone » renseigné, dans le fuseau horaire de la plateforme Producteur MoveUp sinon. \n\nSi la carte a été créée avec support, cette date est non renseignée.",
        )
        .addColumn(colName="cardStatus", dataType=StringType(), comment="Statut de l’équipement")
        .addColumn(
            colName="cardStatusReason",
            dataType=StringType(),
            comment="Code motif en complément du statut carte \n\nVoir liste des motifs de blocage et de désactivation de la carte en annexe de la spécification de Gestion des services du document référencé [10]",
        )
        .addColumn(
            colName="idPreviousCard",
            dataType=StringType(),
            comment="Identifiant unique externe de la carte précédente après renouvellement, remplacement ou réassignation. \n\nPrésente si la carte a remplacé une autre carte.",
        )
        .addColumn(
            colName="idNextCard",
            dataType=StringType(),
            comment="Identifiant unique externe de la carte suivante après renouvellement, remplacement ou réassignation. \n\nPrésente si la carte a été remplacée.",
        )
        .addColumn(
            colName="blockingDate",
            dataType=TimestampType(),
            comment="Date de blocage la carte si la carte est bloquée. \n\nExprimée dans le fuseau horaire du distributeur si paramètre  distributeur DIF-3 « Timezone » renseigné, dans le fuseau horaire de la plateforme Producteur MoveUp sinon.",
        )
        .addColumn(
            colName="activationDate",
            dataType=TimestampType(),
            comment="Date d’activation de la carte si la carte est activée. \n\nExprimée dans le fuseau horaire du distributeur si paramètre  distributeur DIF-3 « Timezone » renseigné, dans le fuseau horaire de la plateforme Producteur MoveUp sinon.",
        )
        .addColumn(colName="orderRef", dataType=StringType(), comment="Référence de la commande")
        .addColumn(colName="expeditionOrderRef", dataType=StringType(), comment="Référence de l’expédition")
        .addColumn(colName="orderStatus", dataType=StringType(), comment="Statut de la commande")
        .addColumn(
            colName="expeditionDate",
            dataType=TimestampType(),
            comment="Date d’expédition de la commande. \n\nExprimée dans le fuseau horaire du distributeur si paramètre  distributeur DIF-3 « Timezone » renseigné, dans le fuseau horaire de la plateforme Producteur MoveUp sinon.",
        )
        .addColumn(
            colName="activationLimitDate",
            dataType=TimestampType(),
            comment="Date limite d’activation de la carte. \n\nExprimée dans le fuseau horaire du distributeur si paramètre  distributeur DIF-3 « Timezone » renseigné, dans le fuseau horaire de la plateforme Producteur MoveUp sinon.",
        )
        .addColumn(colName="artworkRef", dataType=StringType(), comment="Référence de l’œuvre")
        .addColumn(colName="logoRef", dataType=StringType(), comment="Référence du logo")
        .addColumn(colName="packagingRef", dataType=StringType(), comment="Référence du packaging")
        .addColumn(
            colName="pinTryCounter", dataType=IntegerType(), comment="Compteur de tentatives de saisie du code PIN"
        )
        .addColumn(
            colName="lostStolenDate",
            dataType=StringType(),
            comment="Date de déclaration de perte ou de vol de la carte. \n\nExprimée dans le fuseau horaire du distributeur si paramètre  distributeur DIF-3 « Timezone » renseigné, dans le fuseau horaire de la plateforme Producteur MoveUp sinon.",
        )
        .addColumn(
            colName="track2",
            dataType=StructType([StructField("_cvxkeyindex", StringType(), True)]),
            comment="Informations de la piste 2",
        )
        .addColumn(
            colName="cardInterfaceApplications",
            dataType=StructType(
                [
                    StructField(
                        "application",
                        StructType(
                            [
                                StructField("aid", StringType(), True),
                                StructField("contactLessCardInterfaceStatus", StringType(), True),
                                StructField("cvxKeyIndex", StringType(), True),
                                StructField(
                                    "emvCommandList",
                                    StructType(
                                        [
                                            StructField(
                                                "emvCommand",
                                                ArrayType(
                                                    StructType(
                                                        [
                                                            StructField("type", StringType(), True),
                                                            StructField("status", StringType(), True),
                                                            StructField("retryCounter", StringType(), True),
                                                            StructField("date", TimestampType(), True),
                                                        ]
                                                    ),
                                                    True,
                                                ),
                                                True,
                                            )
                                        ]
                                    ),
                                    True,
                                ),
                            ]
                        ),
                        True,
                    )
                ]
            ),
            comment="Applications de l'interface de la carte",
            nullable=True,
        )
        .addColumn(
            colName="emvCommandList",
            dataType=StructType(
                [
                    StructField(
                        "emvCommand",
                        ArrayType(
                            StructType(
                                [
                                    StructField("type", StringType(), True),
                                    StructField("status", StringType(), True),
                                    StructField("retryCounter", StringType(), True),
                                    StructField("date", TimestampType(), True),
                                ]
                            ),
                            True,
                        ),
                        True,
                    )
                ]
            ),
            comment="Liste des commandes EMV en attente d’envoi à la carte, envoyées à la carte ou en attente du résultat de l’exécution. \n\nConcerne les scripts liés à la carte et non à une application de la carte.",
            nullable=True,
        )
        .addColumn(
            colName="cardProfileRef",
            dataType=StringType(),
            comment="Référence du profil carte associé à l’équipement porteur",
        )
        .addColumn(
            colName="newCardTop",
            dataType=StringType(),
            comment="Indicateur de carte refabriquée (renouvelée, remplacée ou remplacée par réassignation).",
        )
        .addColumn(colName="emvProfileId", dataType=StringType(), comment="Profil EMV utilisé pour fabriquer la carte.")
        .addColumn(
            colName="pinProductionFlag",
            dataType=BooleanType(),
            comment="Indicateur de personnalisation du PIN sur la carte. \n\nPrésent lorsque le produit permet à la fois la création de cartes avec PIN et sans PIN (PRE-18 = ‘DUAL’). \n\nAbsent sinon.",
        )
        .addColumn(
            colName="paymentComplementStatus",
            dataType=StringType(),
            comment="Statut d’éligibilité au complément de paiement. \n\nPrésent si l’équipement porteur a été enrôlé au complément de paiement.",
        )
        .addColumn(
            colName="historic",
            dataType=StructType(
                [
                    StructField(
                        "changeStatus",
                        ArrayType(
                            StructType(
                                [
                                    StructField("date", TimestampType(), True),
                                    StructField("actionReason", StringType(), True),
                                    StructField("additionalReason", StringType(), True),
                                    StructField("_status", StringType(), True),
                                ]
                            ),
                            True,
                        ),
                    )
                ]
            ),
            comment="Liste des changements d’état de la carte",
            nullable=True,
        )
        .addColumn(
            colName="xpayData",
            dataType=StructType(
                [
                    StructField(
                        "tokenData",
                        ArrayType(
                            StructType(
                                [
                                    StructField("_tokenId", StringType(), True),
                                    StructField("_tokenAccountNumber", StringType(), True),
                                    StructField("_tokenSequenceNumber", StringType(), True),
                                    StructField("_tokenActivatedDateTime", TimestampType(), True),
                                    StructField("_tokenExpiryDate", StringType(), True),
                                    StructField("_tokenStatus", StringType(), True),
                                    StructField("_tokenRequestorId", StringType(), True),
                                    StructField("_tokenWalletId", StringType(), True),
                                    StructField("_termsAndConditionsAssetId", StringType(), True),
                                    StructField("_termsAndConditionsAcceptedTimestamp", TimestampType(), True),
                                    StructField("_tokenAssuranceLevel", StringType(), True),
                                ]
                            ),
                            True,
                        ),
                    ),
                    StructField("_enrolementXpayFlag", BooleanType(), True),
                ]
            ),
            comment="Liste des données XPAY1 pour la carte",
            nullable=True,
        )
        .addColumn(
            colName="contactLessCardServerStatus",
            dataType=StringType(),
            comment="Statut plateforme de l’interface sans contact. \n\nValorisé si la carte dispose d’une interface sans contact.2 \n\nAbsent sinon.",
        )
        .addColumn(
            colName="contactLessHistoric",
            dataType=StructType(
                [
                    StructField(
                        "changeContactLessStatus",
                        ArrayType(
                            StructType(
                                [StructField("date", TimestampType(), True), StructField("_status", StringType(), True)]
                            ),
                            True,
                        ),
                    )
                ]
            ),
            comment="Contactless historic information",
            nullable=True,
        )
        .addColumn(
            colName="pKeySensitiveDataId",
            dataType=StringType(),
            comment="Identifiant de la clé publique de digitalisation courante utilisée pour chiffrer les données sensibles carte ( PAN, date fin validité, CVX) retournées par les web service DF9-W getSensitive Data et DF9-W getCipheringData. \n\nPrésente  si fournie par le Distributeur lors de la création de la carte avec ou sans support (DF8-B1 ou DF9-W -createDigitalCard ou sur une demande de mise à jour de la clé (DF29-W).",
        )
        .addColumn(
            colName="pKeyCreationDate",
            dataType=TimestampType(),
            comment="Date de création de la clé de digitalisation courante. \n\nPar défaut renseignée avec la date de création de l’équipement porteur. \n\nExprimée dans le fuseau horaire du distributeur si paramètre  distributeur DIF-3 « Timezone » renseigné, dans le fuseau horaire de la plateforme Producteur MoveUp sinon.",
        )
        .addColumn(
            colName="changePinData",
            dataType=StructType(
                [
                    StructField("lastSuccessedChangeDate", TimestampType(), True),
                    StructField("lastFailedChangeDate", TimestampType(), True),
                    StructField("lastFailedChangeErrorCode", StringType(), True),
                    StructField("successedChangeCounter", IntegerType(), True),
                    StructField("failedChangeCounter", IntegerType(), True),
                ]
            ),
            comment="Change Pin data information",
            nullable=True,
        )
        .addColumn(
            colName="changePkeySensitiveDataHistoric",
            dataType=StructType(
                [
                    StructField(
                        "pKeyChange",
                        ArrayType(
                            StructType(
                                [
                                    StructField("date", TimestampType(), True),
                                    StructField("pKeySensitiveDataId", StringType(), True),
                                ]
                            ),
                            True,
                        ),
                    )
                ]
            ),
            comment="Liste des mises à jour de la clé de digitalisation d’un équipement porteur. \n\nPrésent si au moins une mise à jour a été réalisée après création de la clé.",
            nullable=True,
        )
        .addColumn(colName="_sourcefile", dataType=StringType(), comment="Champ technique - Path du fichier source")
        .addColumn(colName="_ingestiondate", dataType=TimestampType(), comment="Champ technique - Date d'ingestion")
        .comment("Table des entêtes de fichiers de cartes")
        .location(
            get_location_func(app_globals.bronze_container, "Cards", app_globals.benefits_bronze_cards_table_name)
        )
        .property("delta.enableChangeDataFeed", "true")
        .execute()
    )


def _init_beneficiaryaccountbalance_bronze_delta_table(
    spark: SparkSession, app_globals: AppGlobals, get_location_func: Callable[[str, str, str], str]
) -> DeltaTable:
    return (
        DeltaTable.createIfNotExists(spark)
        .tableName(app_globals.benefits_bronze_beneficiaryaccountbalance_table_name)
        .comment("Table bronze des soldes des comptes bénéficiaires")
        .location(
            get_location_func(
                app_globals.bronze_container,
                "BeneficiaryAccountBalance",
                app_globals.benefits_bronze_beneficiaryaccountbalance_table_name,
            )
        )
        .property("delta.enableChangeDataFeed", "true")
        .execute()
    )


def _init_beneficiaryaccountbalance_headers_bronze_delta_table(
    spark: SparkSession, app_globals: AppGlobals, get_location_func: Callable[[str, str, str], str]
) -> DeltaTable:
    return (
        DeltaTable.createIfNotExists(spark)
        .tableName(app_globals.benefits_bronze_beneficiaryaccountbalance_headers_table_name)
        .addColumn(
            colName="fileDate",
            dataType=TimestampType(),
            comment="Date de création du fichier par le Producteur, au format ISO 8601. \n\nExprimée dans le fuseau horaire de la plateforme Producteur MoveUp.",
            nullable=False,
        )
        .addColumn(
            colName="fileId",
            dataType=IntegerType(),
            comment="Identifiant du fichier, unique sur 3 mois glissants pour le distributeur concerné. \n\n \n\nOn pourra convenir d’un identifiant numérique, valorisé à 1 pour le tout premier fichier, puis incrémenté de 1 à chaque nouveau fichier.",
            nullable=False,
        )
        .addColumn(
            colName="nbrItems", dataType=IntegerType(), comment="Nombre d’enregistrements détail", nullable=False
        )
        .addColumn(
            colName="distributorRef",
            dataType=StringType(),
            comment="Référence du Distributeur pour lequel l’extraction est générée.",
            nullable=False,
        )
        .addColumn(
            colName="interfaceVersion",
            dataType=IntegerType(),
            comment="Version de l’interface. \n\nValorisée à partir de la version 2 et dans les versions suivantes. \n\nAbsente dans la version 1.",
        )
        .addColumn(colName="_sourcefile", dataType=StringType(), comment="Champ technique - Path du fichier source")
        .addColumn(colName="_ingestiondate", dataType=TimestampType(), comment="Champ technique - Date d'ingestion")
        .comment("Table des entêtes des fichiers de solde des comptes bénéficiaires")
        .location(
            get_location_func(
                app_globals.bronze_container,
                "BeneficiaryAccountBalance",
                app_globals.benefits_bronze_beneficiaryaccountbalance_headers_table_name,
            )
        )
        .property("delta.enableChangeDataFeed", "true")
        .execute()
    )


def _init_beneficiaryaccountbalance_silver_delta_table(
    spark: SparkSession, app_globals: AppGlobals, get_location_func: Callable[[str, str, str], str]
) -> DeltaTable:
    return (
        DeltaTable.createIfNotExists(spark)
        .tableName(app_globals.benefits_silver_beneficiaryaccountbalance_table_name)
        # fileDate
        .addColumn(
            colName="fileDate",
            dataType=TimestampType(),
            comment="Date de création du fichier DF11 par le Producteur",
            nullable=True,
        )
        # fileId
        .addColumn(
            colName="fileId",
            dataType=StringType(),
            comment="Identifiant du fichier, unique sur 3 mois glissants pour le distributeur concerné",
            nullable=True,
        )
        # distributorRef
        .addColumn(
            colName="distributorRef",
            dataType=StringType(),
            comment="Référence du Distributeur pour lequel l’extraction est générée.",
            nullable=True,
        )
        # funderContractRef
        .addColumn(
            colName="funderContractRef",
            dataType=StringType(),
            comment="Référence du contrat de financement",
            nullable=True,
        )
        # beneficiaryServiceRef
        .addColumn(
            colName="beneficiaryServiceRef",
            dataType=StringType(),
            comment="Référence du bénéficiaire",
            nullable=True,
        )
        # accountBalance
        .addColumn(
            colName="accountBalance",
            dataType=DoubleType(),
            comment="Solde du compte bénéficiaire",
            nullable=True,
        )
        # accountBalanceCurrency
        .addColumn(
            colName="accountBalanceCurrency",
            dataType=IntegerType(),
            comment="Devise du solde du compte bénéficiaire",
            nullable=True,
        )
        # realBalance
        .addColumn(
            colName="realBalance",
            dataType=DoubleType(),
            comment="Solde réel du compte bénéficiaire",
            nullable=True,
        )
        # realBalanceCurrency
        .addColumn(
            colName="realBalanceCurrency",
            dataType=IntegerType(),
            comment="Devise du solde réel du compte bénéficiaire",
            nullable=True,
        )
        # accountStatus
        .addColumn(
            colName="accountStatus",
            dataType=StringType(),
            comment="Statut du compte bénéficiaire",
            nullable=True,
        )
        # accountClosedDate
        .addColumn(
            colName="accountClosedDate",
            dataType=TimestampType(),
            comment="Date de fermeture du compte bénéficiaire",
            nullable=True,
        )
        # accountCreationDate
        .addColumn(
            colName="accountCreationDate",
            dataType=TimestampType(),
            comment="Date de création du compte bénéficiaire",
            nullable=True,
        )
        # accountReloabableFlag
        .addColumn(
            colName="accountReloabableFlag",
            dataType=BooleanType(),
            comment="Indicateur de recharge du compte bénéficiaire",
            nullable=True,
        )
        # accountTimeZone
        .addColumn(
            colName="accountTimeZone",
            dataType=StringType(),
            comment="Fuseau horaire du compte bénéficiaire",
            nullable=True,
        )
        # CardList
        # .addColumn(
        #     colName="CardList",
        #     dataType=StructType(
        #         [
        #             StructField(
        #                 "Card",
        #                 ArrayType(
        #                     StructType(
        #                         [
        #                             # StructField("_VALUE", StringType(), nullable=True),
        #                             StructField("_cardId", LongType(), nullable=True),
        #                             StructField("_expiryDate", LongType(), nullable=True),
        #                             StructField("_pan", StringType(), nullable=True),
        #                             StructField("_psn", LongType(), nullable=True),
        #                         ]
        #                     ),
        #                     containsNull=True,
        #                 ),
        #             ),
        #             StructField("_nbrItems", LongType(), nullable=True),
        #         ]
        #     ),
        #     comment="List of cards",
        #     nullable=True,
        # )
        # VoucherList
        .addColumn(
            colName="VoucherList",
            dataType=StructType(
                [
                    StructField(
                        "Voucher",
                        ArrayType(
                            StructType(
                                [
                                    StructField(
                                        "OriginalAmount",
                                        StructType(
                                            [
                                                StructField("amount", LongType(), nullable=True),
                                                StructField("currency", LongType(), nullable=True),
                                                StructField("exponent", LongType(), nullable=True),
                                            ]
                                        ),
                                        nullable=True,
                                    ),
                                    StructField(
                                        "RemainingAmount",
                                        StructType(
                                            [
                                                StructField("amount", LongType(), nullable=True),
                                                StructField("currency", LongType(), nullable=True),
                                                StructField("exponent", LongType(), nullable=True),
                                            ]
                                        ),
                                        nullable=True,
                                    ),
                                    StructField(
                                        "amountBeforeProlongation",
                                        StructType(
                                            [
                                                StructField("amount", LongType(), nullable=True),
                                                StructField("currency", LongType(), nullable=True),
                                                StructField("exponent", LongType(), nullable=True),
                                            ]
                                        ),
                                        nullable=True,
                                    ),
                                    StructField("beginDate", TimestampType(), nullable=True),
                                    StructField("creationDate", TimestampType(), nullable=True),
                                    StructField("endDate", TimestampType(), nullable=True),
                                    StructField("externalReference", StringType(), nullable=True),
                                    StructField("oriExternalReference", StringType(), nullable=True),
                                    StructField("prolongationDate", TimestampType(), nullable=True),
                                    StructField("status", StringType(), nullable=True),
                                    StructField("statusReason", StringType(), nullable=True),
                                    StructField("unloadDate", TimestampType(), nullable=True),
                                    StructField("voucherReason", StringType(), nullable=True),
                                ]
                            ),
                            containsNull=True,
                        ),
                    ),
                ]
            ),
            comment="List of vouchers",
            nullable=True,
        )
        .addColumn(colName="_sourcefile", dataType=StringType(), comment="Champ technique - Path du fichier source")
        .addColumn(colName="_ingestiondate", dataType=TimestampType(), comment="Champ technique - Date d'ingestion")
        # _curationDate
        .addColumn(
            colName="_curationDate",
            dataType=TimestampType(),
            comment="Champ technique - Date Silver",
            nullable=False,
        )
        .comment("Table silver des soldes des comptes bénéficiaires")
        .location(
            get_location_func(
                app_globals.silver_container,
                "BeneficiaryAccountBalance",
                app_globals.benefits_silver_beneficiaryaccountbalance_table_name,
            )
        )
        .property("delta.enableChangeDataFeed", "true")
        .execute()
    )
