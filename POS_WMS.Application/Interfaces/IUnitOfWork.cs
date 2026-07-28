using System;
using System.Threading.Tasks;

namespace POS_WMS.Application.Interfaces
{
    public interface IUnitOfWork : IDisposable
    {
        Task<int> SaveChangesAsync();
    }
}