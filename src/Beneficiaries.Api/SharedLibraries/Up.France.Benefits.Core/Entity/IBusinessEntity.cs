using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    #region Dependencies


    #endregion Dependencies

    public interface IBusinessEntity
    {
        #region Proptotyp Pattern Methods

        object ShallowCopy();

        object Copy();

        #endregion Proptotyp Pattern Methods
    }

    public interface IBusinessEntity<TKey> : IBusinessEntity
    {
        #region Key

        TKey Id { get; set; }

        #endregion Key
    }

    public interface IPartitionedEntity
    {
        #region Key

        string PartitionKey { get; }

        #endregion Key
    }

    [ExcludeFromCodeCoverage]
    public static class IBusinessEntityExtension
    {
        #region Proptotyp Pattern Methods

        public static TEntity ShallowCopy<TEntity>(this TEntity entity)
           where TEntity : class, IBusinessEntity
        {
            return entity.ShallowCopy() as TEntity;
        }

        public static TEntity Copy<TEntity>(this TEntity entity)
            where TEntity : class, IBusinessEntity
        {
            return entity.Copy() as TEntity;
        }

        #endregion Proptotyp Pattern Methods

        #region Collection Proptotyp Pattern Methods

        public static ICollection<TEntity> ShallowCopy<TEntity>(this ICollection<TEntity> entities)
           where TEntity : class, IBusinessEntity
        {
            List<TEntity> copies = new List<TEntity>();
            foreach (TEntity entity in entities)
            {
                copies.Add(entity.ShallowCopy<TEntity>());
            }
            return copies;
        }

        public static ICollection<TEntity> Copy<TEntity>(this ICollection<TEntity> entities)
           where TEntity : class, IBusinessEntity
        {
            List<TEntity> copies = new List<TEntity>();
            foreach (TEntity entity in entities)
            {
                copies.Add(entity.Copy<TEntity>());
            }
            return copies;
        }

        #endregion Collection Proptotyp Pattern Methods
    }
}
