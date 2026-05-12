import { z } from 'zod'

// 更新用户验证
export const updateUserSchema = z.object({
  realName: z.string().optional(),
  phone: z.string().optional(),
  fixedPhone: z
    .string()
    .trim()
    .regex(/^[0-9()+\-\s]{5,20}$/, '请输入正确的固定电话')
    .optional()
    .or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  twoFactorEnabled: z.boolean().optional(),
  roleIds: z.array(z.string()).optional(),
})
