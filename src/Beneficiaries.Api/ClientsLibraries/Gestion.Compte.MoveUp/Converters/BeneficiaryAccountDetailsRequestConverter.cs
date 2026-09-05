using Gestion.Compte.MoveUp.Requests;
using System.Text;

namespace Gestion.Compte.MoveUp.Converters
{
    public static class BeneficiaryAccountDetailsRequestConverter
    {
        // SOAP constants
        private const string SoapNs = "http://www.w3.org/2003/05/soap-envelope";
        private const string ReqNs = "http://www.groupeChequeDejeuner.fr/services/ServiceGestionCompteMoveUp/v8/requestBeneficiaryAccountDetails";
        private const string HeadNs = "http://www.groupeChequeDejeuner.fr/framework/utilities/WebServiceHeader/1.0";

        public static string ToSoapEnvelope(GetBalanceWsReuestDTO dto)
        {
            var req = dto.requestBeneficiaryAccountDetailsReq;

            var sb = new StringBuilder();
            sb.Append($@"<?xml version=""1.0"" encoding=""utf-8""?>");
            sb.Append($@"<soap:Envelope xmlns:soap=""{SoapNs}"" xmlns:req=""{ReqNs}"" xmlns:ns=""{HeadNs}"">");
            sb.Append("<soap:Header/>");
            sb.Append("<soap:Body>");
            sb.Append("<req:requestBeneficiaryAccountDetailsReq>");

            // enteteTechnique
            sb.Append("<req:enteteTechnique>");
            sb.Append($"<ns:userId>{Escape(req.enteteTechnique.userId)}</ns:userId>");
            sb.Append($"<ns:applicationId>{Escape(req.enteteTechnique.applicationId)}</ns:applicationId>");
            sb.Append("</req:enteteTechnique>");

            // donneesInput
            sb.Append("<req:donneesInput>");
            sb.Append($"<req:interfaceVersion>{req.donneesInput.interfaceVersion}</req:interfaceVersion>");
            sb.Append($"<req:distributorRef>{Escape(req.donneesInput.distributorRef)}</req:distributorRef>");
            sb.Append($"<req:beneficiaryServiceRef>{Escape(req.donneesInput.beneficiaryServiceRef)}</req:beneficiaryServiceRef>");
            sb.Append($"<req:voucherListFlag>{req.donneesInput.voucherListFlag.ToString().ToLower()}</req:voucherListFlag>");
            sb.Append("</req:donneesInput>");

            sb.Append("</req:requestBeneficiaryAccountDetailsReq>");
            sb.Append("</soap:Body>");
            sb.Append("</soap:Envelope>");

            return sb.ToString();
        }

        private static string Escape(string? value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            return value
                .Replace("&", "&amp;")
                .Replace("<", "&lt;")
                .Replace(">", "&gt;")
                .Replace("\"", "&quot;")
                .Replace("'", "&apos;");
        }
    }
}
