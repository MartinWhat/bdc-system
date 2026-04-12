'use client'

import { useState, useEffect } from 'react'
import { Cascader, message } from 'antd'

interface Town {
  id: string
  name: string
  code: string
  villages: Array<{
    id: string
    name: string
    code: string
  }>
}

interface TownVillageCascaderProps {
  value?: string[]
  onChange?: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
}

/**
 * 镇街-村居级联选择器
 */
export default function TownVillageCascader({
  value,
  onChange,
  placeholder = '请选择镇街/村居',
  disabled = false,
}: TownVillageCascaderProps) {
  const [options, setOptions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadTowns()
  }, [])

  const loadTowns = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/towns')
      const data = await res.json()

      if (data.success) {
        const cascaderOptions = data.data.map((town: Town) => ({
          value: town.id,
          label: town.name,
          isLeaf: false,
        }))
        setOptions(cascaderOptions)
      }
    } catch (error) {
      message.error('加载镇街数据失败')
    } finally {
      setLoading(false)
    }
  }

  const loadData = async (selectedOptions: any[]) => {
    const targetOption = selectedOptions[selectedOptions.length - 1]
    targetOption.loading = true

    try {
      const townId = targetOption.value
      const res = await fetch(`/api/villages?townId=${townId}`)
      const data = await res.json()

      if (data.success) {
        targetOption.loading = false
        targetOption.children = data.data.map((village: any) => ({
          value: village.id,
          label: village.name,
          isLeaf: true,
        }))
        setOptions([...options])
      }
    } catch (error) {
      targetOption.loading = false
      message.error('加载村居数据失败')
    }
  }

  const handleChange = (selectedValues: any) => {
    onChange?.(selectedValues || [])
  }

  return (
    <Cascader
      value={value}
      options={options}
      onChange={handleChange}
      loadData={loadData}
      placeholder={placeholder}
      disabled={disabled}
      loading={loading}
      changeOnSelect
      style={{ width: '100%' }}
    />
  )
}
