'use client'

import { Result, Button } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'

export default function LingzhengPage() {
  const router = useRouter()

  return (
    <Result
      icon={<FileTextOutlined />}
      title="领证管理"
      subTitle="功能开发中，敬请期待..."
      extra={
        <Button type="primary" onClick={() => router.push('/bdc')}>
          返回宅基地管理
        </Button>
      }
    />
  )
}
