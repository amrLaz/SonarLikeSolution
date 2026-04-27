import os


def get_mock_data_path(filename: str) -> str:
    current_directory = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    mock_data_path = os.path.join(current_directory, filename)
    return mock_data_path


def mock_transaction_payload():
    return {
        "_distributorRef": "RMUPFRANCE",
        "BeneficiaryAccountOperation": [
            {
                "_productRef": "FRACADHOCCE",
                "_beneficiaryServiceRef": "ACC123",
                "Card": {
                    "FirstPresentment": {
                        "_transactionType": "20",
                        "clearingStatus": 1,
                        "clearingReason": "REFUND_REQUIRED",
                        "idAcceptation": "RMLIMONETIK",
                        "_idOperation": "op123",
                        "authorizationReference": "auth789",
                        "dateTransaction": "2023-12-01",
                        "transmissionDateAndTime": "2023-12-01T12:00:00",
                        "reconciliationAmount": {
                            "amount": 100,
                            "exponent": 2,
                            "currency": 978,
                        },
                    }
                },
            }
        ],
    }
