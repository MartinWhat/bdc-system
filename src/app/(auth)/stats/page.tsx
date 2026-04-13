'use client'

import { Result, Button } from 'antd'
import { BarChartOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'

export default function StatsPage() {
  const router = useRouter()

  return (
    <Result
      icon={<BarChartOutlined />}
      title="统计报表"
      subTitle="功能开发中，敬请期待..."
      extra={
        <Button type="primary" onClick={() => router.push('/bdc')}>
          返回宅基地管理
        </Button>
      }
    />
  )
}
