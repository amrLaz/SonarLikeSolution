using Gestion.Compte.MoveUp.Responses;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace Gestion.Compte.MoveUp.Converters
{
    public static class BeneficiaryAccountDetailsResponseConverter
    {
        // Namespaces used in the SOAP response
        private static readonly XNamespace soap = "http://www.w3.org/2003/05/soap-envelope";
        private static readonly XNamespace ns0 = "http://www.groupeChequeDejeuner.fr/services/ServiceGestionCompteMoveUp/v8/requestBeneficiaryAccountDetails";
        private static readonly XNamespace ns1 = "http://www.groupeChequeDejeuner.fr/framework/utilities/WebServiceHeader/1.0";

        public static GetBalanceWsResponseDTO FromSoapXml(string xml)
        {
            var doc = XDocument.Parse(xml);

            var body = doc.Root?
                .Element(soap + "Body");

            if (body == null)
                throw new InvalidOperationException("SOAP Body not found.");

            var resp = body.Element(ns0 + "requestBeneficiaryAccountDetailsResp");
            if (resp == null)
                throw new InvalidOperationException("Response element 'requestBeneficiaryAccountDetailsResp' not found.");

            // ---- enteteTechnique ----
            var enteteTechniqueEl = resp.Element(ns0 + "enteteTechnique");
            var blockingErrorEl = enteteTechniqueEl?.Element(ns1 + "blockingError");

            var entete = new EnteteTechnique
            {
                blockingError = ToBool(blockingErrorEl?.Value) ?? false,
                error = null // add mapping if the service returns detailed <error> blocks
            };

            // ---- donneesOutput ----
            var outEl = resp.Element(ns0 + "donneesOutput");
            if (outEl == null)
                throw new InvalidOperationException("donneesOutput not found.");

            var dtoOutput = new DonneesOutput
            {
                interfaceVersion = outEl.Element(ns0 + "interfaceVersion")?.Value,
                distributorRef = outEl.Element(ns0 + "distributorRef")?.Value,
                funderContractRef = outEl.Element(ns0 + "funderContractRef")?.Value,
                beneficiaryServiceRef = outEl.Element(ns0 + "beneficiaryServiceRef")?.Value
            };

            // ---- card / cardList (sample shows <cardList> … one item) ----
            var firstCardListEl = outEl.Element(ns0 + "cardList");
            if (firstCardListEl != null)
            {
                dtoOutput.cardList = new List<CardList>
{
                new CardList
                {
                    cardId = firstCardListEl.Element(ns0 + "cardId")?.Value,
                    expiryDate = firstCardListEl.Element(ns0 + "expiryDate")?.Value,
                    pan = firstCardListEl.Element(ns0 + "pan")?.Value,
                    psn = firstCardListEl.Element(ns0 + "psn")?.Value
                }
            };
            }

            // Some variants may return a single <card> node; map if present
            var cardEl = outEl.Element(ns0 + "card");
            if (cardEl != null)
            {
                dtoOutput.card = new Card
                {
                    cardId = cardEl.Element(ns0 + "cardId")?.Value,
                    expiryDate = cardEl.Element(ns0 + "expiryDate")?.Value,
                    pan = cardEl.Element(ns0 + "pan")?.Value,
                    psn = cardEl.Element(ns0 + "psn")?.Value
                };
            }

            // Optional accountBalance at root of donneesOutput (your model has AccountBalance2 here)
            var rootAccBalEl = outEl.Element(ns0 + "accountBalance");
            if (rootAccBalEl != null)
            {
                dtoOutput.accountBalance = new AccountBalance2
                {
                    amount = rootAccBalEl.Element(ns0 + "amount")?.Value,
                    currency = rootAccBalEl.Element(ns0 + "currency")?.Value,
                    exponent = rootAccBalEl.Element(ns0 + "exponent")?.Value
                };
            }

            // ---- account ----
            var accountEl = outEl.Element(ns0 + "account");
            if (accountEl != null)
            {
                var account = new Account
                {
                    timeZone = accountEl.Element(ns0 + "timeZone")?.Value
                };

                // accountBalance (inside account)
                var accBalEl = accountEl.Element(ns0 + "accountBalance");
                if (accBalEl != null)
                {
                    account.accountBalance = new AccountBalance
                    {
                        amount = ToInt(accBalEl.Element(ns0 + "amount")?.Value),
                        currency = accBalEl.Element(ns0 + "currency")?.Value,
                        exponent = accBalEl.Element(ns0 + "exponent")?.Value
                    };
                }

                // voucherList: can appear multiple times → list
                var voucherEls = accountEl.Elements(ns0 + "voucherList");
                if (voucherEls != null && voucherEls.Any())
                {
                    account.voucherList = voucherEls.Select(v => new VoucherList
                    {
                        beginDate = ToDate(v.Element(ns0 + "beginDate")?.Value),
                        cancelledDate = v.Element(ns0 + "cancelledDate")?.Value,
                        creationDate = v.Element(ns0 + "creationDate")?.Value,
                        endDate = ToDate(v.Element(ns0 + "endDate")?.Value),
                        externalReference = v.Element(ns0 + "externalReference")?.Value,
                        oriExternalReference = v.Element(ns0 + "oriExternalReference")?.Value,
                        originalAmount = ParseAmount(v.Element(ns0 + "originalAmount")),
                        remainingAmount = ParseAmount(v.Element(ns0 + "remainingAmount")),
                        status = v.Element(ns0 + "status")?.Value,
                        statusReason = v.Element(ns0 + "statusReason")?.Value,
                        unloadDate = v.Element(ns0 + "unloadDate")?.Value,
                        voucherReason = v.Element(ns0 + "voucherReason")?.Value
                    }).ToList();
                }

                // accountAvailableList
                var aAvailListEl = accountEl.Element(ns0 + "accountAvailableList");
                if (aAvailListEl != null)
                {
                    account.accountAvailableList = new List<AccountAvailableList>
                    {
                        new AccountAvailableList
                        {
                        amount = ParseAmount(aAvailListEl.Element(ns0 + "amount"))
                        }
                    };
                }

                // accountAvailableExceptionList
                var aAvailExEl = accountEl.Element(ns0 + "accountAvailableExceptionList");
                if (aAvailExEl != null)
                {
                    account.accountAvailableExceptionList = new List<AccountAvailableExceptionList>
                    {
                        new AccountAvailableExceptionList
                        {
                            amount = ParseAmount(aAvailExEl.Element(ns0 + "amount")),
                            cardId = aAvailExEl.Element(ns0 + "cardId")?.Value
                        }
                    };
                }

                // optional flattened accountAvailable (not in sample, but present in your model)
                var aAvailEl = accountEl.Element(ns0 + "accountAvailable");
                if (aAvailEl != null)
                {
                    account.accountAvailable = new AccountAvailable
                    {
                        amount = ToInt(aAvailEl.Element(ns0 + "amount")?.Value),
                        currency = aAvailEl.Element(ns0 + "currency")?.Value,
                        exponent = aAvailEl.Element(ns0 + "exponent")?.Value
                    };
                }

                dtoOutput.account.Add(account);
            }

            var dto = new GetBalanceWsResponseDTO
            {
                requestBeneficiaryAccountDetailsResp = new RequestBeneficiaryAccountDetailsResp
                {
                    enteteTechnique = entete,
                    donneesOutput = dtoOutput
                }
            };

            return dto;
        }

        // -------- helpers --------

        private static bool? ToBool(string? val)
        {
            if (string.IsNullOrWhiteSpace(val)) return null;
            if (bool.TryParse(val, out var b)) return b;
            if (val == "0") return false;
            if (val == "1") return true;
            return null;
        }

        private static int? ToInt(string? val)
        {
            if (string.IsNullOrWhiteSpace(val)) return null;
            if (int.TryParse(val, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i)) return i;
            return null;
        }

        private static DateTime? ToDate(string? val)
        {
            if (string.IsNullOrWhiteSpace(val)) return null;
            if (DateTime.TryParse(val, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var dt)) return dt;
            return null;
        }

        private static Amount? ParseAmount(XElement? amountContainer)
        {
            if (amountContainer == null) return null;

            var amtStr = amountContainer.Element(ns0 + "amount")?.Value;
            var currency = amountContainer.Element(ns0 + "currency")?.Value;
            var exponent = amountContainer.Element(ns0 + "exponent")?.Value;

            decimal? amtDec = null;
            if (!string.IsNullOrWhiteSpace(amtStr) &&
                decimal.TryParse(amtStr, NumberStyles.Number, CultureInfo.InvariantCulture, out var dec))
            {
                amtDec = dec;
            }

            return new Amount
            {
                amount = amtDec,
                currency = currency,
                exponent = exponent
            };
        }
    }
}
