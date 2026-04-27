namespace Up.France.Benefits.Core
{
    #region Dependencies

    using System.Collections.Generic;
    using System.Diagnostics.CodeAnalysis;
    using System.Linq;

    #endregion Dependencies

    [ExcludeFromCodeCoverage]
    public abstract class ValueObject
    {
        #region Get Values Method
        protected abstract IEnumerable<object> GetValues();

        #endregion Get Values Method

        #region Equals Methods
        public override bool Equals(object? obj)
        {
            if (obj != null && obj.GetType() == GetType())
            {
                ValueObject other = (ValueObject)obj;
                IEnumerator<object> these = GetValues().GetEnumerator();
                IEnumerator<object> others = other.GetValues().GetEnumerator();
                while (these.MoveNext() && others.MoveNext())
                {
                    if (ReferenceEquals(these.Current, null) ^ ReferenceEquals(others.Current, null))
                    {
                        return false;
                    }

                    if (these.Current != null && !these.Current.Equals(others.Current))
                    {
                        return false;
                    }
                }
                return !these.MoveNext() && !others.MoveNext();
            }
            else
            {
                return false;
            }
        }

        #endregion Equals Methods

        #region Get Hash Methods
        public override int GetHashCode()
        {
            return GetValues().Select(x => x != null ? x.GetHashCode() : 0).Aggregate((x, y) => x ^ y);
        }

        #endregion Get Hash Methods

        #region Operator Methods
        protected static bool EqualOperator(ValueObject left, ValueObject right)
        {
            if (ReferenceEquals(left, null) ^ ReferenceEquals(right, null))
            {
                return false;
            }
            return ReferenceEquals(left, null) || left.Equals(right);
        }

        protected static bool NotEqualOperator(ValueObject left, ValueObject right)
        {
            return !(EqualOperator(left, right));
        }

        #endregion Operator Methods
    }
}
