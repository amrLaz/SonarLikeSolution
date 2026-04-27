using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Core.Helpers;
using Up.France.Benefits.Model.Models.Entites;

namespace Up.France.Benefits.Core.Queries
{
    public enum EventsTypes
    {
        LOAD,
        REFUND,
        UNLOAD,
        PURCHASE
    }

    public class EventsFilters
    {
        public string? event_reference { get; set; }
        public string? event_type { get; set; }
        public DateTime? event_date_start { get; set; }
        public DateTime? event_date_end { get; set; }
        public double? event_amount { get; set; }
        public string? event_status { get; set; }


        public IQueryable<Event> applyFilters(IQueryable<Event> query)
        {
            query = this.applyEventReferenceFilter(query);

            query = this.applyEventsTypeFilter(query);

            query = this.applyDateFilter(query);

            query = this.applyEventAmountFilter(query);

            query = this.applyOperationStatusFilter(query);

            return query;
        }
        private IQueryable<Event> applyEventReferenceFilter(IQueryable<Event> query)
        {
            if (this.event_reference == null)
            {
                return query;
            }

            return query.Where(i => i.event_reference == this.event_reference);
        }

        private IQueryable<Event> applyDateFilter(IQueryable<Event> query)
        {
            if (DateTimeFunctions.IsValidDateTime(this.event_date_start) &&
                DateTimeFunctions.IsValidDateTime(this.event_date_end))
            {

                return query.Where(
                    i => i.event_date_iso >= this.event_date_start.Value.AddDays(-1) &&
                    i.event_date_iso <= this.event_date_end);
            }

            return query;
        }

        private IQueryable<Event> applyEventsTypeFilter(IQueryable<Event> query)
        {
            if (this.event_type != null)
            {
                return query.Where(i => (i.event_type == this.event_type));
            }
            return query;
        }

        private IQueryable<Event> applyOperationStatusFilter(IQueryable<Event> query)
        {

            if (this.event_status != null)
            {
                return query.Where(i => (i.event_status == this.event_status));
            }
            return query;
        }

        private IQueryable<Event> applyEventAmountFilter(IQueryable<Event> query)
        {
            if (this.event_amount != null)
            {
                query = query.Where(i => (i.event_amount == this.event_amount));
            }

            return query;
        }



    }
}
