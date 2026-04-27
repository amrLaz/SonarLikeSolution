namespace Up.France.Benefits.Core
{
    #region Dependencies

    using System.Collections.Generic;
    using System.Diagnostics.CodeAnalysis;

    #endregion Dependencies

    [ExcludeFromCodeCoverage]
    public abstract class BusinessEvent<TEntity>
        where TEntity : IBusinessEntity
    {
        #region Fields

        private IDictionary<string, object> _bag;

        #endregion  Fields

        #region Get Event Name

        public virtual string GetName()
        {
            return GetType().Name.Replace("Event", "");
        }

        #endregion Get Event Name

        #region Entity & Bag

        public TEntity Entity { get; set; }

        public TEntity Original { get; set; }

        public IDictionary<string, object> Bag
        {
            get
            {
                if (_bag == null)
                {
                    _bag = new Dictionary<string, object>();
                }
                return _bag;
            }
        }

        #endregion Entity & Bag

        #region Raised By User

        //public IApplicationUser RaisedBy { get; set; }

        #endregion  Raised By User

        #region Configuration

        public virtual bool ShouldSendNotification { get; }

        #endregion  Configuration
    }
}

