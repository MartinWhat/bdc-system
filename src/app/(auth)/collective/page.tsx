'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  message,
  Space,
  Tag,
  Descriptions,
  Tabs,
  Upload,
  Divider,
  Alert,
  Typography,
  DatePicker,
  InputNumber,
  Steps,
  Popconfirm,
  Badge,
} from 'antd'
import {
  EyeOutlined,
  PlusOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LockOutlined,
  UnlockOutlined,
  ExportOutlined,
  ImportOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import TownVillageCascader from '@/components/TownVillageCascader'
import { parseExcelFile, downloadExcelTemplate, validateExcelData } from '@/lib/excel-parser'

const { Text } = Typography

interface Village {
  id: string
  name: string
  town: { id: string; name: string }
}

interface CertOperation {
  id: string
  operationType: string
  operatorName?: string
  description?: string
  createdAt: string
}

interface CollectiveCert {
  id: string
  certNo: string
  ownerName: string
  ownerType: string
  village: Village
  address: string
  area: number
  landUseType?: string
  status: string
  isFrozen: boolean
  freezeReason?: string
  idCard?: string
  phone?: string
  certIssueDate?: string
  certExpiryDate?: string
  stockAt?: string
  outAt?: string
  returnAt?: string
  remark?: string
  createdAt: string
  operations?: CertOperation[]
}

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  PENDING_APPROVE: { text: '待审核', color: 'orange' },
  IN_STOCK: { text: '在库', color: 'green' },
  OUT_STOCK: { text: '已出库', color: 'blue' },
  RETURNED: { text: '已归还', color: 'cyan' },
  CANCELLED: { text: '已注销', color: 'default' },
  FROZEN: { text: '已冻结', color: 'red' },
}

const OWNER_TYPE_MAP: Record<string, string> = {
  VILLAGE_COLLECTIVE: '村集体',
  TOWN_COLLECTIVE: '镇集体',
}

const OPERATION_TYPE_MAP: Record<string, { text: string; icon: React.ReactNode }> = {
  STOCK_APPLY: { text: '入库申请', icon: <ImportOutlined /> },
  STOCK_APPROVE: { text: '入库审核通过', icon: <CheckCircleOutlined /> },
  STOCK_REJECT: { text: '入库审核驳回', icon: <CloseCircleOutlined /> },
  OUT_APPLY: { text: '出库申请', icon: <ExportOutlined /> },
  OUT_APPROVE: { text: '出库审批通过', icon: <CheckCircleOutlined /> },
  OUT_REJECT: { text: '出库审批驳回', icon: <CloseCircleOutlined /> },
  RETURN: { text: '归还', icon: <ImportOutlined /> },
  FREEZE: { text: '冻结', icon: <LockOutlined /> },
  UNFREEZE: { text: '解冻', icon: <UnlockOutlined /> },
  CANCEL: { text: '注销', icon: <CloseCircleOutlined /> },
}

export default function CollectivePage() {
  const [certs, setCerts] = useState<CollectiveCert[]>([])
  const [loading, setLoading] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [batchImportModalVisible, setBatchImportModalVisible] = useState(false)
  const [approveModalVisible, setApproveModalVisible] = useState(false)
  const [outModalVisible, setOutModalVisible] = useState(false)
  const [freezeModalVisible, setFreezeModalVisible] = useState(false)
  const [selectedCert, setSelectedCert] = useState<CollectiveCert | null>(null)
  const [addForm] = Form.useForm()
  const [batchImportForm] = Form.useForm()
  const [approveForm] = Form.useForm()
  const [outForm] = Form.useForm()
  const [freezeForm] = Form.useForm()
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [keyword, setKeyword] = useState<string>('')
  const [selectedVillageId, setSelectedVillageId] = useState<string[]>([])

  // Excel 导入相关状态
  const [excelFile, setExcelFile] = useState<UploadFile | null>(null)
  const [parsedData, setParsedData] = useState<Record<string, unknown>[]>([])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)

  const loadCerts = useCallback(
    async (page = currentPage, size = pageSize, status = statusFilter) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(size),
        })
        if (status) params.append('status', status)
        if (keyword) params.append('keyword', keyword)
        if (selectedVillageId.length > 0 && selectedVillageId[1]) {
          params.append('villageId', selectedVillageId[1])
        }

        const token = localStorage.getItem('access_token')
        const res = await fetch(`/api/collective?${params}`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
          },
        })
        if (!res.ok) {
          if (res.status === 401) {
            message.error('认证已过期，请重新登录')
            return
          }
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        const data = await res.json()
        if (data.success) {
          setCerts(data.data.list)
          setTotal(data.data.total)
        } else {
          message.error(data.error || '加载失败')
        }
      } catch (error) {
        console.error('Load certs error:', error)
        message.error('加载证书列表失败')
      } finally {
        setLoading(false)
      }
    },
    [currentPage, pageSize, statusFilter, keyword, selectedVillageId],
  )

  useEffect(() => {
    loadCerts()
  }, [loadCerts])

  const handleAdd = async (values: {
    certNo: string
    ownerName: string
    ownerType: string
    villageId: string[]
    idCard?: string
    phone?: string
    address: string
    area: number
    landUseType?: string
    certIssueDate?: string
    certExpiryDate?: string
    remark?: string
  }) => {
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch('/api/collective', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...values,
          villageId: values.villageId[1] || values.villageId[0],
          certIssueDate: values.certIssueDate,
          certExpiryDate: values.certExpiryDate,
        }),
      })
      if (!res.ok) {
        if (res.status === 401) {
          message.error('认证已过期，请重新登录')
          return
        }
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      if (data.success) {
        message.success('入库申请已提交')
        setAddModalVisible(false)
        addForm.resetFields()
        loadCerts()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Add cert error:', error)
      message.error('入库申请失败')
    }
  }

  const handleBatchImport = async (values: { items: string; remark?: string }) => {
    try {
      // 解析输入的 JSON 数据
      const items = JSON.parse(values.items)

      const token = localStorage.getItem('access_token')
      const res = await fetch('/api/collective/batch-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) {
        if (res.status === 401) {
          message.error('认证已过期，请重新登录')
          return
        }
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      if (data.success) {
        const { successCount, failedCount, failedItems } = data.data
        message.success(`导入完成：成功 ${successCount}，失败 ${failedCount}`)
        if (failedItems.length > 0) {
          console.warn('失败的条目:', failedItems)
        }
        setBatchImportModalVisible(false)
        batchImportForm.resetFields()
        loadCerts()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Batch import error:', error)
      message.error('批量导入失败，请检查数据格式')
    }
  }

  // Excel 文件处理函数
  const handleExcelUpload = async (file: File) => {
    // 验证文件类型
    const isExcel =
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel' ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls')

    if (!isExcel) {
      message.error('只能上传 Excel 文件（.xlsx 或 .xls）')
      return false
    }

    // 验证文件大小 (5MB)
    const isLt5M = file.size / 1024 / 1024 < 5
    if (!isLt5M) {
      message.error('文件大小不能超过 5MB')
      return false
    }

    setUploadLoading(true)
    try {
      // 解析 Excel 文件
      const data = await parseExcelFile(file)

      if (data.length === 0) {
        message.warning('Excel 文件中没有有效数据')
        return false
      }

      // 验证数据
      const requiredFields = ['certNo', 'ownerName', 'villageId', 'address', 'area']
      const validation = validateExcelData(data, requiredFields)

      if (!validation.valid) {
        message.error('数据验证失败：' + validation.errors.slice(0, 3).join('；'))
        return false
      }

      setParsedData(data)
      setExcelFile({
        uid: '-1',
        name: file.name,
        status: 'done',
      })

      message.success(`成功解析 ${data.length} 条数据，请点击"预览数据"查看`)
      return false // 阻止自动上传
    } catch (error) {
      message.error('Excel 解析失败：' + (error instanceof Error ? error.message : ''))
      return false
    } finally {
      setUploadLoading(false)
    }
  }

  // 提交 Excel 数据到后端
  const handleSubmitExcel = async () => {
    if (parsedData.length === 0) {
      message.error('请先上传 Excel 文件')
      return
    }

    if (parsedData.length > 100) {
      message.error('单次最多导入 100 条数据')
      return
    }

    setUploadLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch('/api/collective/batch-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items: parsedData }),
      })

      if (!res.ok) {
        if (res.status === 401) {
          message.error('认证已过期，请重新登录')
          return
        }
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const data = await res.json()
      if (data.success) {
        const { successCount, failedCount, failedItems } = data.data
        message.success(`导入完成：成功 ${successCount}，失败 ${failedCount}`)

        if (failedItems.length > 0) {
          console.warn('失败的条目:', failedItems)
          message.warning(`${failedCount} 条数据导入失败，请检查后重新导入`)
        }

        // 重置状态
        setBatchImportModalVisible(false)
        setExcelFile(null)
        setParsedData([])
        setPreviewVisible(false)
        loadCerts()
      } else {
        message.error(data.error || '导入失败')
      }
    } catch (error) {
      console.error('Batch import error:', error)
      message.error('批量导入失败，请检查网络或数据格式')
    } finally {
      setUploadLoading(false)
    }
  }

  // 下载导入模板
  const handleDownloadTemplate = () => {
    downloadExcelTemplate(
      [
        { key: 'certNo', title: '证书编号', example: '3301010010010001' },
        { key: 'ownerName', title: '所有权人名称', example: 'XX村村民委员会' },
        { key: 'ownerType', title: '所有权类型', example: 'VILLAGE_COLLECTIVE' },
        { key: 'villageId', title: '村居ID', example: '村居ID' },
        { key: 'address', title: '地址', example: 'XX镇XX村' },
        { key: 'area', title: '面积(平方米)', example: '1000.5' },
        { key: 'idCard', title: '身份证号', example: '' },
        { key: 'phone', title: '手机号', example: '' },
        { key: 'remark', title: '备注', example: '示例数据' },
      ],
      '村集体所有权导入模板',
    )
    message.success('模板下载成功')
  }

  const handleApprove = async (action: 'approve' | 'reject', remark?: string) => {
    if (!selectedCert) return

    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/collective/${selectedCert.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, remark }),
      })
      if (!res.ok) {
        if (res.status === 401) {
          message.error('认证已过期，请重新登录')
          return
        }
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      if (data.success) {
        message.success(action === 'approve' ? '审核通过' : '审核驳回')
        setApproveModalVisible(false)
        approveForm.resetFields()
        loadCerts()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Approve error:', error)
      message.error('审核操作失败')
    }
  }

  const handleOut = async (values: { outReason: string; expectedReturnDate?: string }) => {
    if (!selectedCert) return

    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/collective/${selectedCert.id}/out`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        if (res.status === 401) {
          message.error('认证已过期，请重新登录')
          return
        }
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      if (data.success) {
        message.success('出库成功')
        setOutModalVisible(false)
        outForm.resetFields()
        loadCerts()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Out error:', error)
      message.error('出库操作失败')
    }
  }

  const handleReturn = async (cert: CollectiveCert) => {
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/collective/${cert.id}/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        if (res.status === 401) {
          message.error('认证已过期，请重新登录')
          return
        }
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      if (data.success) {
        message.success('归还成功')
        loadCerts()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Return error:', error)
      message.error('归还操作失败')
    }
  }

  const handleFreeze = async (values: { freezeReason: string }) => {
    if (!selectedCert) return

    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/collective/${selectedCert.id}/freeze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        if (res.status === 401) {
          message.error('认证已过期，请重新登录')
          return
        }
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      if (data.success) {
        message.success('冻结成功')
        setFreezeModalVisible(false)
        freezeForm.resetFields()
        loadCerts()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Freeze error:', error)
      message.error('冻结操作失败')
    }
  }

  const handleUnfreeze = async (cert: CollectiveCert) => {
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/collective/${cert.id}/freeze`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!res.ok) {
        if (res.status === 401) {
          message.error('认证已过期，请重新登录')
          return
        }
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      if (data.success) {
        message.success('解冻成功')
        loadCerts()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Unfreeze error:', error)
      message.error('解冻操作失败')
    }
  }

  const handleCancel = async (cert: CollectiveCert) => {
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/collective/${cert.id}?reason=管理员注销`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!res.ok) {
        if (res.status === 401) {
          message.error('认证已过期，请重新登录')
          return
        }
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      if (data.success) {
        message.success('注销成功')
        loadCerts()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Cancel error:', error)
      message.error('注销操作失败')
    }
  }

  const loadCertDetail = async (cert: CollectiveCert) => {
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/collective/${cert.id}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      })
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      if (data.success) {
        setSelectedCert(data.data)
        setDetailVisible(true)
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Load cert detail error:', error)
      message.error('加载详情失败')
    }
  }

  const columns: ColumnsType<CollectiveCert> = useMemo(
    () => [
      {
        title: '证书编号',
        dataIndex: 'certNo',
        key: 'certNo',
        width: 150,
      },
      {
        title: '所有权人',
        dataIndex: 'ownerName',
        key: 'ownerName',
        width: 120,
      },
      {
        title: '类型',
        dataIndex: 'ownerType',
        key: 'ownerType',
        width: 80,
        render: (type: string) => OWNER_TYPE_MAP[type] || type,
      },
      {
        title: '所属村居',
        key: 'village',
        render: (_, record) => `${record.village.town.name} - ${record.village.name}`,
      },
      {
        title: '面积',
        dataIndex: 'area',
        key: 'area',
        width: 100,
        render: (area: number) => `${area} 平方米`,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: string, record) => {
          const config = STATUS_MAP[status]
          return (
            <Badge
              status={record.isFrozen ? 'error' : 'success'}
              text={<Tag color={config.color}>{config.text}</Tag>}
            />
          )
        },
      },
      {
        title: '入库时间',
        dataIndex: 'stockAt',
        key: 'stockAt',
        width: 120,
        render: (date) => (date ? dayjs(date).format('YYYY-MM-DD') : '-'),
      },
      {
        title: '操作',
        key: 'action',
        width: 250,
        render: (_, record) => (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => loadCertDetail(record)}>
              详情
            </Button>
            {record.status === 'PENDING_APPROVE' && (
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  setSelectedCert(record)
                  setApproveModalVisible(true)
                }}
              >
                审核
              </Button>
            )}
            {record.status === 'IN_STOCK' && !record.isFrozen && (
              <>
                <Button
                  size="small"
                  onClick={() => {
                    setSelectedCert(record)
                    setOutModalVisible(true)
                  }}
                >
                  出库
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setSelectedCert(record)
                    setFreezeModalVisible(true)
                  }}
                >
                  冻结
                </Button>
                <Popconfirm title="确定注销该证书？" onConfirm={() => handleCancel(record)}>
                  <Button size="small" danger>
                    注销
                  </Button>
                </Popconfirm>
              </>
            )}
            {record.status === 'OUT_STOCK' && (
              <Popconfirm title="确定归还该证书？" onConfirm={() => handleReturn(record)}>
                <Button size="small" type="primary">
                  归还
                </Button>
              </Popconfirm>
            )}
            {record.isFrozen && (
              <Popconfirm title="确定解冻该证书？" onConfirm={() => handleUnfreeze(record)}>
                <Button size="small">解冻</Button>
              </Popconfirm>
            )}
          </Space>
        ),
      },
    ],
    [],
  )

  return (
    <PageContainer
      title="村集体所有权管理"
      extra={
        <Space>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => setAddModalVisible(true)}>
            入库申请
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setBatchImportModalVisible(true)}>
            批量导入
          </Button>
        </Space>
      }
      dataSource={certs}
      loading={loading}
      skeleton={{ active: true, paragraph: { rows: 10 } }}
      emptyDescription="暂无证书数据"
    >
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索证书编号或所有权人"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={() => loadCerts(1, pageSize)}
          style={{ width: 250 }}
        />
        <TownVillageCascader
          value={selectedVillageId}
          onChange={(value) => {
            setSelectedVillageId(value as string[])
            loadCerts(1, pageSize)
          }}
          placeholder="选择镇街/村居"
        />
        <Select
          placeholder="状态筛选"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value)
            loadCerts(1, pageSize, value)
          }}
          allowClear
          style={{ width: 120 }}
          options={Object.entries(STATUS_MAP).map(([key, val]) => ({
            value: key,
            label: val.text,
          }))}
        />
      </Space>

      <Table
        columns={columns}
        dataSource={certs}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          onChange: (page, size) => {
            setCurrentPage(page)
            setPageSize(size)
            loadCerts(page, size)
          },
        }}
      />

      {/* 详情模态框 */}
      <Modal
        title="证书详情"
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false)
          setSelectedCert(null)
        }}
        footer={null}
        width={900}
      >
        {selectedCert && (
          <>
            <Descriptions bordered column={2} style={{ marginBottom: 24 }}>
              <Descriptions.Item label="证书编号">{selectedCert.certNo}</Descriptions.Item>
              <Descriptions.Item label="所有权人">{selectedCert.ownerName}</Descriptions.Item>
              <Descriptions.Item label="所有权类型">
                {OWNER_TYPE_MAP[selectedCert.ownerType]}
              </Descriptions.Item>
              <Descriptions.Item label="所属村居">
                {selectedCert.village.town.name} - {selectedCert.village.name}
              </Descriptions.Item>
              <Descriptions.Item label="地址" span={2}>
                {selectedCert.address}
              </Descriptions.Item>
              <Descriptions.Item label="面积">{selectedCert.area} 平方米</Descriptions.Item>
              <Descriptions.Item label="土地用途">
                {selectedCert.landUseType || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="身份证号">{selectedCert.idCard || '-'}</Descriptions.Item>
              <Descriptions.Item label="联系电话">{selectedCert.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="发证日期">
                {selectedCert.certIssueDate
                  ? dayjs(selectedCert.certIssueDate).format('YYYY-MM-DD')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="有效期">
                {selectedCert.certExpiryDate
                  ? dayjs(selectedCert.certExpiryDate).format('YYYY-MM-DD')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[selectedCert.status].color}>
                  {STATUS_MAP[selectedCert.status].text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="是否冻结">
                {selectedCert.isFrozen ? (
                  <Tag color="red">已冻结</Tag>
                ) : (
                  <Tag color="green">正常</Tag>
                )}
              </Descriptions.Item>
              {selectedCert.freezeReason && (
                <Descriptions.Item label="冻结原因" span={2}>
                  {selectedCert.freezeReason}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="入库时间">
                {selectedCert.stockAt
                  ? dayjs(selectedCert.stockAt).format('YYYY-MM-DD HH:mm')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="出库时间">
                {selectedCert.outAt ? dayjs(selectedCert.outAt).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="归还时间">
                {selectedCert.returnAt
                  ? dayjs(selectedCert.returnAt).format('YYYY-MM-DD HH:mm')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {selectedCert.remark || '-'}
              </Descriptions.Item>
            </Descriptions>

            <Divider>操作记录</Divider>
            {selectedCert.operations && selectedCert.operations.length > 0 ? (
              <Steps
                direction="vertical"
                size="small"
                items={selectedCert.operations.map((op) => ({
                  title: OPERATION_TYPE_MAP[op.operationType]?.text || op.operationType,
                  description: (
                    <span>
                      {op.description}
                      {op.operatorName && ` - ${op.operatorName}`}
                      <br />
                      {dayjs(op.createdAt).format('YYYY-MM-DD HH:mm')}
                    </span>
                  ),
                  status: ['STOCK_APPROVE', 'OUT_APPROVE', 'RETURN', 'UNFREEZE'].includes(
                    op.operationType,
                  )
                    ? 'finish'
                    : ['STOCK_REJECT', 'OUT_REJECT', 'FREEZE', 'CANCEL'].includes(op.operationType)
                      ? 'error'
                      : 'wait',
                }))}
              />
            ) : (
              <Text type="secondary">暂无操作记录</Text>
            )}
          </>
        )}
      </Modal>

      {/* 入库申请模态框 */}
      <Modal
        title="入库申请"
        open={addModalVisible}
        onCancel={() => {
          setAddModalVisible(false)
          addForm.resetFields()
        }}
        onOk={() => addForm.submit()}
        width={700}
      >
        <Form form={addForm} layout="vertical" onFinish={handleAdd}>
          <Form.Item
            name="certNo"
            label="证书编号"
            rules={[{ required: true, message: '请输入证书编号' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="ownerName"
            label="所有权人名称"
            rules={[{ required: true, message: '请输入所有权人名称' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="ownerType" label="所有权类型" initialValue="VILLAGE_COLLECTIVE">
            <Select>
              <Select.Option value="VILLAGE_COLLECTIVE">村集体</Select.Option>
              <Select.Option value="TOWN_COLLECTIVE">镇集体</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="villageId"
            label="所属村居"
            rules={[{ required: true, message: '请选择村居' }]}
          >
            <TownVillageCascader placeholder="选择镇街/村居" />
          </Form.Item>

          <Form.Item name="idCard" label="身份证号">
            <Input />
          </Form.Item>

          <Form.Item name="phone" label="联系电话">
            <Input />
          </Form.Item>

          <Form.Item
            name="address"
            label="地址"
            rules={[{ required: true, message: '请输入地址' }]}
          >
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item name="area" label="面积" rules={[{ required: true, message: '请输入面积' }]}>
            <InputNumber min={0} suffix="平方米" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="landUseType" label="土地用途">
            <Input />
          </Form.Item>

          <Form.Item name="certIssueDate" label="发证日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="certExpiryDate" label="有效期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入模态框 */}
      <Modal
        title="批量导入证书"
        open={batchImportModalVisible}
        onCancel={() => {
          setBatchImportModalVisible(false)
          setExcelFile(null)
          setParsedData([])
          setPreviewVisible(false)
          batchImportForm.resetFields()
        }}
        footer={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
              下载模板
            </Button>
            <Button
              onClick={() => {
                if (parsedData.length > 0) {
                  setPreviewVisible(!previewVisible)
                } else {
                  message.warning('请先上传 Excel 文件')
                }
              }}
              disabled={parsedData.length === 0}
            >
              {previewVisible ? '隐藏预览' : '预览数据'} ({parsedData.length} 条)
            </Button>
            <Button
              onClick={() => {
                setBatchImportModalVisible(false)
                setExcelFile(null)
                setParsedData([])
                setPreviewVisible(false)
                batchImportForm.resetFields()
              }}
            >
              取消
            </Button>
            <Button
              type="primary"
              loading={uploadLoading}
              onClick={handleSubmitExcel}
              disabled={parsedData.length === 0}
            >
              确认导入
            </Button>
          </Space>
        }
        width={900}
      >
        <Alert
          message="导入说明"
          description="请上传 Excel 文件（.xlsx 或 .xls），支持中文表头。第一行为中文标题，第二行为英文字段名。最多支持 100 条数据。"
          type="info"
          style={{ marginBottom: 16 }}
        />

        {/* 文件上传区域 */}
        <Upload.Dragger
          name="file"
          showUploadList={false}
          beforeUpload={handleExcelUpload}
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          maxCount={1}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽 Excel 文件到此区域</p>
          <p className="ant-upload-hint">支持 .xlsx 和 .xls 格式，文件大小不超过 5MB</p>
          {excelFile && (
            <div style={{ marginTop: 8 }}>
              <Tag color="green">{excelFile.name}</Tag>
            </div>
          )}
        </Upload.Dragger>

        {/* 数据预览表格 */}
        {previewVisible && parsedData.length > 0 && (
          <div style={{ marginTop: 16, maxHeight: 400, overflow: 'auto' }}>
            <Table
              size="small"
              dataSource={parsedData}
              rowKey={(record, index) => String(index)}
              scroll={{ y: 300 }}
              pagination={false}
              columns={[
                {
                  title: '行号',
                  width: 60,
                  render: (_, __, index) => (index || 0) + 1,
                },
                {
                  title: '证书编号',
                  dataIndex: 'certNo',
                  key: 'certNo',
                  width: 150,
                },
                {
                  title: '所有权人',
                  dataIndex: 'ownerName',
                  key: 'ownerName',
                  width: 150,
                },
                {
                  title: '村居ID',
                  dataIndex: 'villageId',
                  key: 'villageId',
                  width: 100,
                },
                {
                  title: '地址',
                  dataIndex: 'address',
                  key: 'address',
                  width: 150,
                },
                {
                  title: '面积',
                  dataIndex: 'area',
                  key: 'area',
                  width: 80,
                },
              ]}
            />
          </div>
        )}
      </Modal>

      {/* 审核模态框 */}
      <Modal
        title="入库审核"
        open={approveModalVisible}
        onCancel={() => {
          setApproveModalVisible(false)
          approveForm.resetFields()
          setSelectedCert(null)
        }}
        footer={
          <Space>
            <Button onClick={() => handleApprove('reject', approveForm.getFieldValue('remark'))}>
              驳回
            </Button>
            <Button
              type="primary"
              onClick={() => handleApprove('approve', approveForm.getFieldValue('remark'))}
            >
              通过
            </Button>
          </Space>
        }
        width={500}
      >
        {selectedCert && (
          <Descriptions column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="证书编号">{selectedCert.certNo}</Descriptions.Item>
            <Descriptions.Item label="所有权人">{selectedCert.ownerName}</Descriptions.Item>
            <Descriptions.Item label="所属村居">
              {selectedCert.village.town.name} - {selectedCert.village.name}
            </Descriptions.Item>
            <Descriptions.Item label="面积">{selectedCert.area} 平方米</Descriptions.Item>
          </Descriptions>
        )}

        <Form form={approveForm} layout="vertical">
          <Form.Item name="remark" label="审核备注">
            <Input.TextArea rows={3} placeholder="可选备注" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 出库模态框 */}
      <Modal
        title="证书出库"
        open={outModalVisible}
        onCancel={() => {
          setOutModalVisible(false)
          outForm.resetFields()
          setSelectedCert(null)
        }}
        onOk={() => outForm.submit()}
        width={500}
      >
        {selectedCert && (
          <Descriptions column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="证书编号">{selectedCert.certNo}</Descriptions.Item>
            <Descriptions.Item label="所有权人">{selectedCert.ownerName}</Descriptions.Item>
          </Descriptions>
        )}

        <Form form={outForm} layout="vertical" onFinish={handleOut}>
          <Form.Item
            name="outReason"
            label="出库原因"
            rules={[{ required: true, message: '请输入出库原因' }]}
          >
            <Input.TextArea rows={3} placeholder="请输入出库原因" />
          </Form.Item>

          <Form.Item name="expectedReturnDate" label="预计归还日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 冻结模态框 */}
      <Modal
        title="冻结证书"
        open={freezeModalVisible}
        onCancel={() => {
          setFreezeModalVisible(false)
          freezeForm.resetFields()
          setSelectedCert(null)
        }}
        onOk={() => freezeForm.submit()}
        width={500}
      >
        {selectedCert && (
          <Descriptions column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="证书编号">{selectedCert.certNo}</Descriptions.Item>
            <Descriptions.Item label="所有权人">{selectedCert.ownerName}</Descriptions.Item>
          </Descriptions>
        )}

        <Alert message="冻结后证书将无法出库或操作" type="warning" style={{ marginBottom: 16 }} />

        <Form form={freezeForm} layout="vertical" onFinish={handleFreeze}>
          <Form.Item
            name="freezeReason"
            label="冻结原因"
            rules={[{ required: true, message: '请输入冻结原因' }]}
          >
            <Input.TextArea rows={3} placeholder="请输入冻结原因" />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
