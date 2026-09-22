using System;
using System.Text;
using System.Text.RegularExpressions;

namespace POS_WMS.Domain.Common
{
    public static class StringNormalizationHelper
    {
        private static readonly Regex MultipleSpacesRegex = new Regex(@"\s+", RegexOptions.Compiled);
        private static readonly Regex NonDigitsPhoneRegex = new Regex(@"[^\d+]", RegexOptions.Compiled);

        /// <summary>
        /// Cleans display names: trims leading/trailing whitespace, collapses consecutive whitespace to a single space, and normalizes Unicode to FormC.
        /// Preserves Vietnamese diacritics and original casing.
        /// </summary>
        public static string NormalizeDisplayName(string? input)
        {
            if (string.IsNullOrWhiteSpace(input))
                return string.Empty;

            var normalizedUnicode = input.Normalize(NormalizationForm.FormC).Trim();
            return MultipleSpacesRegex.Replace(normalizedUnicode, " ");
        }

        /// <summary>
        /// Produces a normalized lowercase string for uniqueness check and indexing.
        /// "Nước ngọt", "  nước   ngọt  ", "NƯỚC NGỌT" all result in "nước ngọt".
        /// </summary>
        public static string NormalizeForComparison(string? input)
        {
            var cleaned = NormalizeDisplayName(input);
            return cleaned.ToLowerInvariant();
        }

        /// <summary>
        /// Normalizes usernames: trims, converts to lowercase invariant, FormC Unicode.
        /// "Admin", "admin", " ADMIN " -> "admin".
        /// </summary>
        public static string NormalizeUsername(string? input)
        {
            if (string.IsNullOrWhiteSpace(input))
                return string.Empty;

            var trimmed = input.Normalize(NormalizationForm.FormC).Trim();
            return trimmed.ToLowerInvariant();
        }

        /// <summary>
        /// Normalizes barcodes: trims whitespace.
        /// </summary>
        public static string NormalizeBarcode(string? input)
        {
            if (string.IsNullOrWhiteSpace(input))
                return string.Empty;

            return input.Trim();
        }

        /// <summary>
        /// Normalizes tax codes: trims whitespace, uppercase invariant.
        /// </summary>
        public static string NormalizeTaxCode(string? input)
        {
            if (string.IsNullOrWhiteSpace(input))
                return string.Empty;

            return input.Trim().ToUpperInvariant();
        }

        /// <summary>
        /// Normalizes phone numbers: strips spaces, dashes, dots.
        /// </summary>
        public static string NormalizePhone(string? input)
        {
            if (string.IsNullOrWhiteSpace(input))
                return string.Empty;

            return NonDigitsPhoneRegex.Replace(input.Trim(), "");
        }

        /// <summary>
        /// Normalizes emails: trims, lowercase invariant.
        /// </summary>
        public static string NormalizeEmail(string? input)
        {
            if (string.IsNullOrWhiteSpace(input))
                return string.Empty;

            return input.Trim().ToLowerInvariant();
        }
    }
}
