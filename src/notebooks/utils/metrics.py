import base64
import datetime
import hashlib
import hmac
import json

import requests
import logging


class LogAnalyticsRequest:

    endpoint = "/api/logs"
    api_version = "api-version=2016-04-01"
    content_type = "application/json"

    def __init__(self, config, environment: str):
        self.logger = logging.getLogger(__name__)
        self.workspace_id = config.Application__Monitoring__Workspace__Id
        self.access_key = config.Application__Monitoring__Workspace__Key
        self.table_name = f"{environment.capitalize()}_EF1T_SLA"
        self._py4j_logger = logging.getLogger("py4j")
        self._py4j_logger.setLevel(logging.ERROR)

    def build_signature(self, date, content_length):
        x_headers = "x-ms-date:" + date
        string_to_hash = (
            "POST\n" + str(content_length) + "\n" + self.content_type + "\n" + x_headers + "\n" + self.endpoint
        )
        bytes_to_hash = bytes(string_to_hash, encoding="utf-8")
        decoded_key = base64.b64decode(self.access_key)
        encoded_hash = base64.b64encode(
            hmac.new(decoded_key, bytes_to_hash, digestmod=hashlib.sha256).digest()
        ).decode()
        authorization = f"SharedKey {self.workspace_id}:{encoded_hash}"
        return authorization

    def post_data(self, body):
        rfc1123date = datetime.datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
        json_body = json.dumps(body)
        content_length = len(json_body)
        signature = self.build_signature(rfc1123date, content_length)
        uri = f"https://{self.workspace_id}.ods.opinsights.azure.com{self.endpoint}?{self.api_version}"
        headers = {
            "content-type": self.content_type,
            "Authorization": signature,
            "Log-Type": self.table_name,
            "x-ms-date": rfc1123date,
        }

        response = requests.post(uri, data=json_body, headers=headers)
        if response.status_code >= 200 and response.status_code <= 299:
            self.logger.error(f"Accepted: {response.status_code}")
        else:
            self.logger.error(f"Response code: {response.status_code}, {response.reason}")
