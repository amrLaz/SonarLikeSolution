using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Up.France.Benefits.Configuration.Configurations
{
    public class GestionCompteMoveUp
    {
        public string WsBaseUrl { get; set; }
        public string OcpApimSubscriptionKey { get; set; }
        public MoveUpProductsConfs MoveUpProductsConfs { get; set; }
    }
}
