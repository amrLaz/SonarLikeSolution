using Gestion.Compte.MoveUp.Abstract;
using Gestion.Compte.MoveUp.Requests;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Configuration;
using Up.France.Benefits.Configuration.Configurations;

namespace Gestion.Compte.MoveUp.Factories
{
    public class BeneficiaryAccountDetailsRequestFactory : IBeneficiaryAccountDetailsRequestFactory
    {
        private MoveUpProductsConfs _moveUpProductsConfs;
        public BeneficiaryAccountDetailsRequestFactory(BenefitsConfiguration benefitsConfiguration) 
        {
            _moveUpProductsConfs = benefitsConfiguration.GestionCompteMoveUp.MoveUpProductsConfs;
        }
        public GetBalanceWsReuestDTO CreateBeneficiaryAccountDetailsRequest(string accountId,int product)
        {
            string userId ="";
            string applicationId="";
            string distributorRef="";
            bool voucherListFlag = true;
            if (product == 12)
            {
                userId = _moveUpProductsConfs.UpDejeunerHybride.CodeApplicationESB;
                applicationId = _moveUpProductsConfs.UpDejeunerHybride.CodeApplicationESB;
                distributorRef = _moveUpProductsConfs.UpDejeunerHybride.CodeDistributeur;

            }else if (product == 20) 
            {
                userId = _moveUpProductsConfs.UpCadhocHybride.CodeApplicationESB;
                applicationId = _moveUpProductsConfs.UpCadhocHybride.CodeApplicationESB;
                distributorRef = _moveUpProductsConfs.UpCadhocHybride.CodeDistributeur;
            }
            else if(product == 11)
            {
                userId = _moveUpProductsConfs.UpDejeuner4C.CodeApplicationESB; 
                applicationId = _moveUpProductsConfs.UpDejeuner4C.CodeApplicationESB;
                distributorRef = _moveUpProductsConfs.UpDejeuner4C.CodeDistributeur;
            }
            else if (product == 24)
            {
                userId = _moveUpProductsConfs.UpCadhoc4C.CodeApplicationESB;
                applicationId = _moveUpProductsConfs.UpCadhoc4C.CodeApplicationESB;
                distributorRef = _moveUpProductsConfs.UpCadhoc4C.CodeDistributeur;
            }
            else if (product == 30)
            {
                userId = "D365-HYB";
                applicationId = "D365-HYB";
                distributorRef = "RMUPFRANCE";
                voucherListFlag = false;
            }
            else
            {
                throw new Exception($"Unknown product for account {accountId} ");
            }

            var request = new RequestBeneficiaryAccountDetailsReq
            {
                enteteTechnique = new EnteteTechnique
                {
                    userId = userId,
                    applicationId = applicationId
                },
                donneesInput = new DonneesInput
                {
                    interfaceVersion = 5,
                    distributorRef = distributorRef,
                    beneficiaryServiceRef = accountId,
                    voucherListFlag = voucherListFlag
                }
            };

                GetBalanceWsReuestDTO getBalanceReuest = new GetBalanceWsReuestDTO
            {
                requestBeneficiaryAccountDetailsReq = request
            };

            return getBalanceReuest;
        }
    }
}
