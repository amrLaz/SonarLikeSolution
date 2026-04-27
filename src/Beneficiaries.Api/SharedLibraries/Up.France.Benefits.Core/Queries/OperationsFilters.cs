using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Core.Helpers;
using Up.France.Benefits.Model.Models.Entites;

namespace Up.France.Benefits.Core.Queries
{
    public enum OperationsTypes
    {
        LOAD,
        REFUND,
        UNLOAD,
        PURCHASE
    }

    public class OperationsFilters
    {
        public DateTime? DateStart { get; set; }
        public DateTime? DateEnd { get; set; }
        public Boolean? LoadUnloadMustBeAcceptedOrCompleted { get; set; } = true;
        public Boolean? IsClassicPagination { get; set; } = false;
        public Boolean? FilterOutOperationsOfTypeInformation { get; set; } = true;
        public Boolean? IncludeCashWithdrawalOperations { get; set; } = false;
        public List<string>? operationTypes { get; set; }
        public string? operationStatus { get; set; }
        public decimal? amountMin { get; set; }
        public decimal? amountMax { get; set; }
        public string? operationRef { get; set; }
        public bool? OnlyAcceptedPurchaseOperations { get; set; } = false;


        public IQueryable<Operation> applyFilters(IQueryable<Operation> query)
        {
            query = this.applyDateFilter(query);

            query = this.applyFilterLoadUnLoadMustBeCompletedOrAccepter(query);

            query = this.applyFilterIncludeCashWithdrawalOperations(query);
            
            query = this.applyOperationTypeFilter(query);

            query = this.applyOperationStatusFilter(query);

            query = this.applyOperationRefFilter(query);

            query = this.applyMinMaxAmountFilter(query);

            query = this.FilterOutInformationOperations(query);

            query = this.applyFilterOnlyAcceptedPurchaseOperations(query);

            return query;
        }
        private IQueryable<Operation> applyFilterLoadUnLoadMustBeCompletedOrAccepter(IQueryable<Operation> query)
        {
            if (!(bool)this.LoadUnloadMustBeAcceptedOrCompleted)
            {
                return query;
            }

            return query.Where(
                    i =>
                    (i.operation_type != "LOAD" && i.operation_type != "UNLOAD") ||
                    (i.operation_status == "COMPLETED" || i.operation_status == "ACCEPTED")
                );
        }

        private IQueryable<Operation> applyFilterOnlyAcceptedPurchaseOperations(IQueryable<Operation> query)
        {
            if (!(bool)this.OnlyAcceptedPurchaseOperations)
            {
                return query;
            }

            return query.Where(
                    i =>
                    (i.operation_type == "PURCHASE") && (i.operation_status == "COMPLETED" || i.operation_status == "ACCEPTED")
                );
        }

        private IQueryable<Operation> applyFilterIncludeCashWithdrawalOperations(IQueryable<Operation> query)
        {
            if ((bool)this.IncludeCashWithdrawalOperations)
            {
                return query;

            }
            return query.Where(
                i => i.operation_type != "CASH_WITHDRAWAL"

            );
            
        }

        private IQueryable<Operation> applyDateFilter(IQueryable<Operation> query)
        {
            if (DateTimeFunctions.IsValidDateTime(this.DateStart) &&
                DateTimeFunctions.IsValidDateTime(this.DateEnd))
            {

                return query.Where(
                    i => i.operation_date >= this.DateStart.Value.AddDays(-1) &&
                    i.operation_date <= this.DateEnd);
            }

            return query;

        }
        private IQueryable<Operation> applyOperationTypeFilter(IQueryable<Operation> query)
        {
            if (this.operationTypes != null && this.operationTypes.Any())
            {
                var parsedEnumValues = new List<string>();

                foreach (var op in this.operationTypes)
                {
                    if (Enum.TryParse<OperationsTypes>(op, true, out var parsed))
                    {
                        parsedEnumValues.Add(parsed.ToString());
                    }
                    else
                    { 
                        throw new ArgumentException($"Invalid operation type: '{op}' is not a valid Operation types value.");
                    }
                }

                return query.Where(i => parsedEnumValues.Contains(i.operation_type));
            }

            return query;
        }


        private IQueryable<Operation> applyOperationStatusFilter(IQueryable<Operation> query)
        {

            if (this.operationStatus != null)
            {
                return query.Where(i => (i.operation_status == this.operationStatus));
            }
            return query;
        }

        private IQueryable<Operation> FilterOutInformationOperations(IQueryable<Operation> query)
        {
            if ((bool) this.FilterOutOperationsOfTypeInformation)
            {
                return query.Where(i => (i.operation_type != "INFORMATION"));
            }

            return query;
        }

        private IQueryable<Operation> applyOperationRefFilter(IQueryable<Operation> query)
        {
            if (this.operationRef != null)
            {
                return query.Where(i => (i.operation_reference == this.operationRef));
            }
            return query;
        }
        private IQueryable<Operation> applyMinMaxAmountFilter(IQueryable<Operation> query)
        {
            if (this.amountMin != null)
            {
                query = query.Where(i => (i.actual_amount >= this.amountMin));
            }

            if (this.amountMax != null)
            {
                query = query.Where(i => (i.actual_amount <= this.amountMax));
            }

            return query;
        }



    }
}
