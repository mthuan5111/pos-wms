using System;

namespace POS_WMS.WebApi.Common
{
    public class ApiResponse<T>
    {
        public bool IsSuccess { get; set; }
        public string Message { get; set; } = string.Empty;
        public string ErrorCode { get; set; } = string.Empty;
        public T? Data { get; set; }

        public int? PageIndex { get; set; }
        public int? TotalPages { get; set; }
        public int? TotalRecords { get; set; }

        public static ApiResponse<T> Success(T data, string message = "Thao tác thành công")
        {
            return new ApiResponse<T>
            {
                IsSuccess = true,
                Data = data,
                Message = message
            };
        }

        public static ApiResponse<T> Success(T data, int pageIndex, int totalPages, int totalRecords, string message = "Thao tác thành công")
        {
            return new ApiResponse<T>
            {
                IsSuccess = true,
                Data = data,
                Message = message,
                PageIndex = pageIndex,
                TotalPages = totalPages,
                TotalRecords = totalRecords
            };
        }

        public static ApiResponse<T> Failure(string message, string errorCode = "ERR_INTERNAL_500")
        {
            return new ApiResponse<T>
            {
                IsSuccess = false,
                Data = default,
                Message = message,
                ErrorCode = errorCode
            };
        }
    }
}