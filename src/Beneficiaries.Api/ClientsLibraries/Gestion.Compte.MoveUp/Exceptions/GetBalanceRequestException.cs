using System.Diagnostics.CodeAnalysis;

namespace Gestion.Compte.MoveUp.Exceptions
{
    [Serializable]
    [ExcludeFromCodeCoverage]
    public sealed class GetBalanceRequestException : Exception
    {
        public GetBalanceRequestException()
        {
        }

        public GetBalanceRequestException(string message)
            : base(message)
        {
        }

        public GetBalanceRequestException(string message, Exception inner)
            : base(message, inner)
        {
        }
    }
}
