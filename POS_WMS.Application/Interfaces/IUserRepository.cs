using POS_WMS.Domain.Entities;
using System.Threading.Tasks;

namespace POS_WMS.Application.Interfaces
{
    public interface IUserRepository : IGenericRepository<User>
    {
        Task<User?> GetByUsernameAsync(string username);
    }
}