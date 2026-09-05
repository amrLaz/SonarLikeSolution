namespace Up.France.Benefits.Core
{
    #region Dependencies

    using System.Collections.Generic;
    using System.Diagnostics.CodeAnalysis;

    #endregion Dependencies

    [ExcludeFromCodeCoverage]
    public class CommandEvent<TCommand>
        where TCommand : IBusinessCommand
    {
        #region Fields

        private IDictionary<string, object> _bag = null!;

        #endregion  Fields

        #region Constructor Methods

        public CommandEvent()
        {
        }

        #endregion Constructor Methods

        #region Get Event Name

        public virtual string GetName()
        {
            return EventName.Replace("Event", "");
        }

        #endregion Get Event Name

        #region Command & Bag

        public TCommand Command { get; set; } = default!;

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

        #endregion Command & Bag

        #region Raised By User

        //public IApplicationUser RaisedBy { get; set; }

        public string EventName { get; set; } = null!;


        #endregion Raised By User
    }

    public interface IBusinessCommand
    {
    }
}
