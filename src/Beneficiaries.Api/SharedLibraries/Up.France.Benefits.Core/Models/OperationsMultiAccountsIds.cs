using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Up.France.Benefits.Core.Models
{
    [ExcludeFromCodeCoverage]
    public class OperationsMultiAccountsIds
    {
        [Required]
        public List<string> accountsIds { get; set; } = null!;

    
    }
}
