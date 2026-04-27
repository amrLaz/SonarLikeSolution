namespace Up.France.Benefits.Core
{
    #region Dependencies

    using Newtonsoft.Json;
    using System.Collections.Generic;
    using System.Diagnostics.CodeAnalysis;

    #endregion Dependencies

    [ExcludeFromCodeCoverage]
    public abstract class BusinessEntity<TKey> : IBusinessEntity<TKey>, IDictionaryConvertible
    {
        #region Key

        [JsonProperty("id")]
        public virtual TKey Id { get; set; }

        #endregion  Key

        #region Convert Methods

        public virtual Dictionary<string, object> ToDictionary()
        {
            return new Dictionary<string, object>();
        }

        #endregion Convert Methods

        #region Proptotyp Pattern Methods

        public object ShallowCopy()
        {
            return MemberwiseClone();
        }

        public abstract object Copy();

        #endregion Proptotyp Pattern Methods
    }
}
