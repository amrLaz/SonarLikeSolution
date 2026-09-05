namespace Up.France.Benefits.Core
{
    #region Dependencies

    using System.Collections.Generic;

    #endregion Dependencies

    public interface IDictionaryConvertible
    {
        #region Convert Methods

        Dictionary<string, object> ToDictionary();

        #endregion Convert Methods
    }
}
