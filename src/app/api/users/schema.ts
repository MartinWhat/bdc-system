import { z } from 'zod'

// 更新用户验证
export const updateUserSchema = z.object({
  realName: z.string().optional(),
  idCard: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  twoFactorEnabled: z.boolean().optional(),
  roleIds: z.array(z.string()).optional(),
})
