import { logOperation, type LogOperationInput } from '@/lib/log'

export async function safeLogOperation(input: LogOperationInput) {
  try {
    await logOperation(input)
  } catch (error) {
    console.error('[OperationLog] Failed to write log:', error)
  }
}
