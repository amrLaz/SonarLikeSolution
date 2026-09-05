from pyspark.sql.types import (
    StructType,
    StructField,
    StringType,
    IntegerType,
    TimestampType,
    DoubleType,
    ArrayType,
    LongType,
    BooleanType,
)


amount_struct = StructType(
    [
        StructField("amount", DoubleType(), True),
        StructField("currency", DoubleType(), True),
        StructField("exponent", DoubleType(), True),
    ]
)

voucher_impact_struct = StructType(
    [
        StructField(
            "voucherImpact",
            ArrayType(
                StructType(
                    [
                        StructField("_context", StringType(), True),
                        StructField("amount", DoubleType(), True),
                        StructField("externalReference", StringType(), True),
                        StructField("amountImpact", amount_struct, True),
                        StructField("voucherReason", StringType(), True),
                    ]
                )
            ),
            True,
        )
    ]
)

payment_complement_struct = StructType(
    [
        StructField("_scpRequestDate", StringType(), True),
        StructField("_scpResponseDate", StringType(), True),
        StructField("_substitutionPaymentReason", StringType(), True),
        StructField("_scpResponseCode", StringType(), True),
        StructField("complementAmount", amount_struct, True),
    ]
)

ef1t_amount_struct = StructType(
    [
        StructField("amount", DoubleType(), True),
        StructField("currency", StringType(), True),
        StructField("exponent", DoubleType(), True),
    ]
)

ef1t_payment_complement_struct = StructType(
    [
        StructField("scpRequestDate", StringType(), True),
        StructField("scpResponseDate", StringType(), True),
        StructField("substitutionPaymentReason", StringType(), True),
        StructField("scpResponseCode", StringType(), True),
        StructField("complementAmount", ef1t_amount_struct, True),
    ]
)

xpay_struct = StructType(
    [
        StructField("_tokenId", StringType(), True),
        StructField("_tokenAccountNumber", StringType(), True),
        StructField("_tokenWalletId", StringType(), True),
    ]
)

domestic_acceptor_struct = StructType(
    [
        StructField("acceptorTaxIdProvidedCode", StringType(), True),
        StructField("acceptorTaxId", StringType(), True),
    ]
)


Ef1tSchema = StructType(
    [
        StructField(
            "notification",
            StructType(
                [
                    StructField("distributorRef", StringType(), True),
                    StructField("interfaceVersion", IntegerType(), True),
                    StructField(
                        "message",
                        StructType(
                            [
                                StructField("funderContractRef", StringType(), True),
                                StructField("productRef", StringType(), True),
                                StructField("messageId", IntegerType(), True),
                                StructField("messageDate", TimestampType(), True),
                                StructField("beneficiaryServiceRef", StringType(), True),
                                StructField(
                                    "contextData",
                                    StructType(
                                        [
                                            StructField(
                                                "operationDateTime",
                                                TimestampType(),
                                                True,
                                            ),
                                            StructField("operationType", StringType(), True),
                                            StructField("operationNature", StringType(), True),
                                            StructField(
                                                "operationAmount",
                                                StructType(
                                                    [
                                                        StructField("amount", DoubleType(), True),
                                                        StructField(
                                                            "exponent",
                                                            IntegerType(),
                                                            True,
                                                        ),
                                                        StructField(
                                                            "currency",
                                                            StringType(),
                                                            True,
                                                        ),
                                                    ]
                                                ),
                                                True,
                                            ),
                                            StructField(
                                                "accountBalance",
                                                StructType(
                                                    [
                                                        StructField("amount", DoubleType(), True),
                                                        StructField(
                                                            "exponent",
                                                            IntegerType(),
                                                            True,
                                                        ),
                                                        StructField(
                                                            "currency",
                                                            StringType(),
                                                            True,
                                                        ),
                                                    ]
                                                ),
                                                True,
                                            ),
                                            StructField(
                                                "realBalance",
                                                StructType(
                                                    [
                                                        StructField("amount", DoubleType(), True),
                                                        StructField(
                                                            "exponent",
                                                            IntegerType(),
                                                            True,
                                                        ),
                                                        StructField(
                                                            "currency",
                                                            StringType(),
                                                            True,
                                                        ),
                                                    ]
                                                ),
                                                True,
                                            ),
                                            StructField(
                                                "accountAvailable",
                                                StructType(
                                                    [
                                                        StructField("amount", DoubleType(), True),
                                                        StructField(
                                                            "exponent",
                                                            IntegerType(),
                                                            True,
                                                        ),
                                                        StructField(
                                                            "currency",
                                                            StringType(),
                                                            True,
                                                        ),
                                                    ]
                                                ),
                                                True,
                                            ),
                                            StructField("accountCategory", StringType(), True),
                                            StructField("codeMCC", StringType(), True),
                                            StructField(
                                                "canalAcceptationValue",
                                                StringType(),
                                                True,
                                            ),
                                            StructField("nomMarchand", StringType(), True),
                                            StructField("dateTransaction", StringType(), True),
                                            StructField(
                                                "authorizationReference",
                                                StringType(),
                                                True,
                                            ),
                                            StructField("operationId", StringType(), True),  # BALANCE_NOTIFICATION/LOAD
                                            StructField("reason", StringType(), True),  # BALANCE_NOTIFICATION/LOAD
                                            StructField(
                                                "dateTransmissionTransaction",
                                                StringType(),
                                                True,
                                            ),
                                            StructField("saeTimeSpent", StringType(), True),
                                            StructField("idContratAffilie", StringType(), True),
                                            StructField("idAcceptation", StringType(), True),
                                            StructField("idMarchand", StringType(), True),
                                            StructField("villeMarchand", StringType(), True),
                                            StructField("codepostalMarchand", StringType(), True),
                                            StructField("numAut", StringType(), True),
                                            StructField("cardId", StringType(), True),
                                            StructField("psn", StringType(), True),
                                            StructField("truncatedPAN", StringType(), True),
                                            StructField("codeRetour", StringType(), True),
                                            StructField("idTerminal", StringType(), True),
                                            StructField("traceNumber", StringType(), True),
                                            StructField("posEntryMode", StringType(), True),
                                            StructField(
                                                "amount",
                                                StructType(
                                                    [
                                                        StructField("amount", StringType(), True),
                                                        StructField(
                                                            "exponent",
                                                            StringType(),
                                                            True,
                                                        ),
                                                        StructField(
                                                            "currency",
                                                            StringType(),
                                                            True,
                                                        ),
                                                    ]
                                                ),
                                                True,
                                            ),
                                            StructField("countryCode", StringType(), True),
                                            StructField(
                                                "respPartialApprovalFlag",
                                                StringType(),
                                                True,
                                            ),
                                            StructField("respCardStatus", StringType(), True),
                                            StructField(
                                                "voucherImpacts",
                                                StructType(
                                                    [
                                                        StructField(
                                                            "voucherImpact",
                                                            ArrayType(
                                                                StructType(
                                                                    [
                                                                        StructField(
                                                                            "externalReference",
                                                                            StringType(),
                                                                            True,
                                                                        ),
                                                                        StructField(
                                                                            "amountImpact",
                                                                            StructType(
                                                                                [
                                                                                    StructField(
                                                                                        "amount",
                                                                                        IntegerType(),
                                                                                        True,
                                                                                    ),
                                                                                    StructField(
                                                                                        "exponent",
                                                                                        IntegerType(),
                                                                                        True,
                                                                                    ),
                                                                                    StructField(
                                                                                        "currency",
                                                                                        StringType(),
                                                                                        True,
                                                                                    ),
                                                                                ]
                                                                            ),
                                                                            True,
                                                                        ),
                                                                        StructField(
                                                                            "voucherReason",
                                                                            StringType(),
                                                                            True,
                                                                        ),
                                                                    ]
                                                                )
                                                            ),
                                                            True,
                                                        )
                                                    ]
                                                ),
                                                True,
                                            ),
                                            StructField(
                                                "xpay",
                                                StructType(
                                                    [
                                                        StructField(
                                                            "tokenWalletId",
                                                            StringType(),
                                                            True,
                                                        ),
                                                        StructField(
                                                            "tokenExpiryDate",
                                                            StringType(),
                                                            True,
                                                        ),
                                                        StructField(
                                                            "tokenId",
                                                            StringType(),
                                                            True,
                                                        ),
                                                        StructField(
                                                            "tokenRequestorId",
                                                            StringType(),
                                                            True,
                                                        ),
                                                        StructField(
                                                            "tokenType",
                                                            StringType(),
                                                            True,
                                                        ),
                                                        StructField(
                                                            "tokenAccountNumber",
                                                            StringType(),
                                                            True,
                                                        ),
                                                    ]
                                                ),
                                                True,
                                            ),
                                            StructField(
                                                "preAuthorizationFlag",
                                                StringType(),
                                                True,
                                            ),
                                            StructField("cardSchemeCode", StringType(), True),
                                            StructField("posData", StringType(), True),
                                            StructField(
                                                "finalAuthorizationIndicator",
                                                StringType(),
                                                True,
                                            ),
                                            StructField("prdCheckCvx2", StringType(), True),
                                            StructField("indPresenceCvx2", StringType(), True),
                                            StructField("addMerchantData", StringType(), True),
                                            StructField("codeRetourRequest", StringType(), True),
                                            StructField("avisCodeMotif", StringType(), True),
                                            StructField("oriAcquirerId", StringType(), True),
                                            StructField("oriMontant", StringType(), True),
                                            StructField("oriDateTransaction", StringType(), True),
                                            StructField("oriTraceNumber", StringType(), True),
                                            StructField(
                                                "oriAuthorizationReference",
                                                StringType(),
                                                True,
                                            ),
                                            StructField(
                                                "codeRaisonDetaillee",
                                                StringType(),
                                                True,
                                            ),
                                            StructField(
                                                "regularizationOrigine",
                                                StringType(),
                                                True,
                                            ),
                                            StructField("traceId", StringType(), True),
                                            StructField("ecomm", StringType(), True),
                                            StructField("paymentComplement", ef1t_payment_complement_struct, True),
                                        ]
                                    ),
                                    True,
                                ),
                            ]
                        ),
                        True,
                    ),
                ]
            ),
            True,
        )
    ]
)


presentment_schema = StructType(
    [
        StructField("_fileDate", TimestampType(), nullable=True),
        StructField("_fileId", StringType(), nullable=True),
        StructField("_nbrItems", IntegerType(), nullable=True),
        StructField("_distributorRef", StringType(), nullable=True),
        StructField("_interfaceVersion", IntegerType(), nullable=True),
        StructField(
            "BeneficiaryAccountOperation",
            ArrayType(
                StructType(
                    [
                        StructField("_beneficiaryServiceLabel", StringType(), True),
                        StructField("_beneficiaryServiceRef", StringType(), True),
                        StructField("_funderContractLabel", StringType(), True),
                        StructField("_funderContractRef", StringType(), True),
                        StructField("_productRef", StringType(), True),
                        StructField(
                            "Card",
                            ArrayType(
                                StructType(
                                    [
                                        StructField("_cardId", StringType(), True),
                                        StructField("_expiryDate", LongType(), True),
                                        StructField("_pan", StringType(), True),
                                        StructField("_psn", LongType(), True),
                                        StructField("Authorization", StringType(), nullable=True),
                                        StructField("FeeCollection", StringType(), nullable=True),
                                        StructField(
                                            "FirstPresentment",
                                            ArrayType(
                                                StructType(
                                                    [
                                                        StructField("_cardSchemeCode", StringType(), True),
                                                        StructField("_functionCode", LongType(), True),
                                                        StructField("_idContratAffilie", StringType(), True),
                                                        StructField("_idOperation", StringType(), True),
                                                        StructField("_messageTypeIdentifier", LongType(), True),
                                                        StructField("_partialReversalFlag", BooleanType(), True),
                                                        StructField("_processingDate", StringType(), True),
                                                        StructField("_reversalFlag", BooleanType(), True),
                                                        StructField("_technicalErrorDetail", StringType(), True),
                                                        StructField("_technicalErrorType", StringType(), True),
                                                        StructField("_technicalStatus", StringType(), True),
                                                        StructField("_transactionType", LongType(), True),
                                                        StructField("accountImpact", BooleanType(), True),
                                                        StructField("acquirerReferenceNumber", StringType(), True),
                                                        StructField("authorizationNotFound", BooleanType(), True),
                                                        StructField("authorizationReference", StringType(), True),
                                                        StructField("canalAcceptationValue", StringType(), True),
                                                        StructField("cardStatus", StringType(), True),
                                                        StructField("clearingStatus", LongType(), True),
                                                        StructField("clearingReason", StringType(), True),
                                                        StructField("transactionType", StringType(), True),
                                                        StructField("codeMCC", StringType(), True),
                                                        StructField("posEntryMode", StringType(), True),
                                                        StructField("counterfeitCardTop", BooleanType(), True),
                                                        StructField("countryCode", LongType(), True),
                                                        StructField("dateTransaction", StringType(), True),
                                                        StructField("donneePrivee", StringType(), True),
                                                        StructField("duplicateCtrlTop", BooleanType(), True),
                                                        StructField("ecomm", StringType(), True),
                                                        StructField("idAcceptation", StringType(), True),
                                                        StructField("idMarchand", StringType(), True),
                                                        StructField("idRemise", LongType(), True),
                                                        StructField("idTerminal", StringType(), True),
                                                        StructField("interchangeFee", StringType(), True),
                                                        StructField("itp", StringType(), True),
                                                        StructField("latePresentationTop", BooleanType(), True),
                                                        StructField("nlsa", StringType(), True),
                                                        StructField("nomMarchand", StringType(), True),
                                                        StructField("villeMarchand", StringType(), True),
                                                        StructField("codepostalMarchand", StringType(), True),
                                                        StructField("numAut", LongType(), True),
                                                        StructField("offlineAutReversalFlag", BooleanType(), True),
                                                        StructField("originalIdOperation", LongType(), True),
                                                        StructField("reconciliationAmount", amount_struct, True),
                                                        StructField("traceNumber", LongType(), True),
                                                        StructField("transactionAmount", amount_struct, True),
                                                        StructField("transmissionDateAndTime", StringType(), True),
                                                        StructField("typeFacture", LongType(), True),
                                                        StructField("typePaiementOrigine", LongType(), True),
                                                        StructField("unknownPAN", BooleanType(), True),
                                                        StructField("voucherImpacts", voucher_impact_struct, True),
                                                        StructField("xpay", xpay_struct, True),
                                                        StructField(
                                                            "domesticAcceptorTaxId", domestic_acceptor_struct, True
                                                        ),
                                                        StructField(
                                                            "paymentComplement", payment_complement_struct, True
                                                        ),
                                                    ]
                                                )
                                            ),
                                        ),
                                    ]
                                )
                            ),
                        ),
                    ]
                )
            ),
        ),
    ]
)

voucher_thunes_impact_struct = StructType(
    [
        StructField(
            "voucherImpact",
            ArrayType(
                StructType(
                    [
                        StructField("_operationType", StringType(), True),
                        StructField("_context", StringType(), True),
                        StructField("amount", DoubleType(), True),
                        StructField("externalReference", StringType(), True),
                        StructField("amountImpact", amount_struct, True),
                        StructField("voucherReason", StringType(), True),
                    ]
                )
            ),
            True,
        )
    ]
)

thunes_schema = StructType(
    [
        StructField("_fileDate", TimestampType(), True),
        StructField("_fileId", StringType(), True),
        StructField("_nbrItems", IntegerType(), True),
        StructField("_distributorRef", StringType(), True),
        StructField(
            "BeneficiaryAccountOperation",
            ArrayType(
                StructType(
                    [
                        StructField("_productRef", StringType(), True),
                        StructField("_funderContractRef", StringType(), True),
                        StructField("_beneficiaryServiceRef", StringType(), True),
                        StructField(
                            "Card",
                            StructType(
                                [
                                    StructField("_cardId", StringType(), True),
                                    StructField("_pan", StringType(), True),
                                    StructField("_psn", StringType(), True),
                                    StructField(
                                        "FirstPresentment",
                                        StructType(
                                            [
                                                StructField("_idContratAffilie", StringType(), True),
                                                StructField("_idOperation", StringType(), True),
                                                StructField("_cardSchemeCode", StringType(), True),
                                                StructField("_messageTypeIdentifier", StringType(), True),
                                                StructField("_functionCode", StringType(), True),
                                                StructField("_transactionType", StringType(), True),
                                                StructField("_processingDate", TimestampType(), True),
                                                StructField("_technicalStatus", StringType(), True),
                                                StructField("_reversalFlag", BooleanType(), True),
                                                StructField("canalAcceptationValue", StringType(), True),
                                                StructField("reconciliationAmount", amount_struct, True),
                                                StructField("complementAmount", amount_struct, True),
                                                StructField("cardStatus", StringType(), True),
                                                StructField("transmissionDateAndTime", TimestampType(), True),
                                                StructField("numAut", LongType(), True),
                                                StructField("clearingStatus", IntegerType(), True),
                                                StructField("authorizationNotFound", BooleanType(), True),
                                                StructField("purchaseNotFound", BooleanType(), True),
                                                StructField("unknownPAN", BooleanType(), True),
                                                StructField("duplicateCtrlTop", BooleanType(), True),
                                                StructField("latePresentationTop", BooleanType(), True),
                                                StructField("counterfeitCardTop", BooleanType(), True),
                                                StructField("acquirerReferenceNumber", StringType(), True),
                                                StructField("idMarchand", StringType(), True),
                                                StructField("idAcceptation", StringType(), True),
                                                StructField("countryCode", IntegerType(), True),
                                                StructField("traceNumber", StringType(), True),
                                                StructField("idRemise", StringType(), True),
                                                StructField("accountImpact", BooleanType(), True),
                                                StructField("insufficientBalanceFlag", BooleanType(), True),
                                                StructField("offlineAutReversalFlag", BooleanType(), True),
                                                StructField("dateTransaction", TimestampType(), True),
                                                StructField("settlementDate", TimestampType(), True),
                                                StructField("voucherImpacts", voucher_thunes_impact_struct, True),
                                                StructField("donneePrivee", StringType(), True),
                                                StructField("authorizationReference", StringType(), True),
                                                StructField("clearingReason", StringType(), True),
                                                StructField("typeFacture", StringType(), True),
                                                StructField("traceId", StringType(), True),
                                                StructField("itp", StringType(), True),
                                                StructField("nlsa", StringType(), True),
                                            ]
                                        ),
                                        True,
                                    ),
                                ]
                            ),
                            True,
                        ),
                    ]
                )
            ),
        ),
    ]
)
