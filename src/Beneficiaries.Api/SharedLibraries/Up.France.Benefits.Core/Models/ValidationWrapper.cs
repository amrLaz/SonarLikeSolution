using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public sealed class ValidationWrapper<T>
    {
        public bool IsValid { get; set; }
        public T Value { get; set; } = default!;

        public IEnumerable<ValidationResult> ValidationResults { get; set; } = null!;
    }
}
