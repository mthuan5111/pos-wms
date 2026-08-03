using Microsoft.EntityFrameworkCore;
using POS_WMS.Application.Interfaces;
using POS_WMS.Domain.Entities;
using System.Threading.Tasks;

namespace POS_WMS.Infrastructure.Persistence
{
    public class UserRepository : GenericRepository<User>, IUserRepository
    {
        public UserRepository(ApplicationDbContext context) : base(context)
        {
        }
        public async Task<User?> GetByUsernameAsync(string username)
        {
            return await _dbSet.FirstOrDefaultAsync(u => u.Username == username);
        }
    }
}