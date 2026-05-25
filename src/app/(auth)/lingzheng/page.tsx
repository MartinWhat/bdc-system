'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Card,
  Grid,
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Space,
  Tag,
  Descriptions,
  Steps,
  Upload,
  Divider,
  Alert,
  Typography,
  Pagination,
  Tree,
  Row,
  Col,
} from 'antd'
import {
  EyeOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  UploadOutlined,
  DownloadOutlined,
  UsergroupAddOutlined,
  EnvironmentOutlined,
  HomeOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { DataNode } from 'antd/es/tree'
import type { UploadFile } from 'antd/es/upload/interface'
import dayjs from 'dayjs'
import { useRouter, useSearchParams } from 'next/navigation'
import PageContainer from '@/components/PageContainer'
import { parseExcelFile, downloadExcelTemplate, validateExcelData } from '@/lib/excel-parser'
import { authFetch } from '@/lib/api-fetch'
import { normalizeCertNo } from '@/lib/utils/cert-no'

const { Text } = Typography

interface Village {
  id: string
  name: string
  town: { name: string }
}

interface Town {
  id: string
  name: string
  children?: Array<{
    id: string
    name: string
  }>
}

interface Bdc {
  id: string
  certNo: string
  ownerName: string
  address: string
  idCard?: string
  phone?: string
  village: Village
}

interface ProcessNode {
  id: string
  nodeType: string
  nodeName: string
  operatorName?: string
  description?: string
  createdAt: string
}

interface ReceiveRecord {
  id: string
  bdcId: string
  status: string
  receiverName?: string
  receiverIdCard?: string
  receiverPhone?: string
  remark?: string
  applyDate: string
  issueDate?: string
  receiveDate?: string
  signedBy?: string
  signedDate?: string
  bdc: Bdc
  processNodes: ProcessNode[]
  hasIdCardFront?: boolean
  hasIdCardBack?: boolean
  hasScenePhoto?: boolean
  // 异议状态
  hasObjection?: boolean
  activeObjectionId?: string | null
}

interface ImportRowLog {
  rowNo: number
  certNo: string
  ownerName?: string
  status: 'SUCCESS' | 'FAILED'
  reason?: string
  bdcId?: string
}

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待领证', color: 'orange' },
  ISSUED: { text: '已发放', color: 'blue' },
  COMPLETED: { text: '已领证', color: 'green' },
  OBJECTION: { text: '异议中', color: 'red' },
  CANCELLED: { text: '已取消', color: 'default' },
}

const ID_CARD_REGEX = /^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/
const PHONE_REGEX = /^1[3-9]\d{9}$/

export default function LingzhengPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [records, setRecords] = useState<ReceiveRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [receiveModalVisible, setReceiveModalVisible] = useState(false)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<ReceiveRecord | null>(null)
  const [selectedBdc, setSelectedBdc] = useState<Bdc | null>(null)
  const [towns, setTowns] = useState<Town[]>([])
  const [treeLoading, setTreeLoading] = useState(false)
  const [selectedTownId, setSelectedTownId] = useState('')
  const [selectedVillageId, setSelectedVillageId] = useState('')
  const [receiveForm] = Form.useForm()
  const [createForm] = Form.useForm()
  const [importForm] = Form.useForm()
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [idCardFront, setIdCardFront] = useState<string>('')
  const [idCardBack, setIdCardBack] = useState<string>('')
  const [scenePhoto, setScenePhoto] = useState<string>('')

  // Excel 导入相关状态
  const [excelFile, setExcelFile] = useState<UploadFile | null>(null)
  const [parsedData, setParsedData] = useState<Record<string, unknown>[]>([])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [importRows, setImportRows] = useState<ImportRowLog[]>([])
  const [importSummary, setImportSummary] = useState<{
    total: number
    successCount: number
    failedCount: number
  } | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)

  // 提取到组件外部避免每次渲染重新创建
  const loadRecords = useCallback(
    async (page = 1, size = 10, status = '', townId = '', villageId = '') => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(size),
        })
        if (status) params.append('status', status)
        if (townId) params.append('townId', townId)
        if (villageId) params.append('villageId', villageId)

        const res = await authFetch(`/api/receive?${params}`)
        if (!res.ok) {
          if (res.status === 401) {
            message.error('认证已过期，请重新登录')
            return
          }
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        const data = await res.json()
        if (data.success) {
          setRecords(data.data.list)
          setTotal(data.data.total)
        } else {
          message.error(data.error || '加载失败')
        }
      } catch (error) {
        console.error('Load records error:', error)
        message.error('加载领证记录失败')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    loadRecords(1, 10, '', '', '')
  }, [loadRecords])

  const loadTowns = useCallback(async () => {
    setTreeLoading(true)
    try {
      const res = await authFetch('/api/towns')
      const data = await res.json()
      if (data.success) {
        setTowns(data.data)
      }
    } catch (error) {
      console.error('Load towns error:', error)
    } finally {
      setTreeLoading(false)
    }
  }, [])

  const loadVillages = useCallback(async (townId: string) => {
    try {
      const res = await authFetch(`/api/villages?townId=${townId}`)
      const data = await res.json()
      if (data.success) {
        return data.data as Array<{ id: string; name: string; town: { id: string; name: string } }>
      }
    } catch (error) {
      console.error('Load villages error:', error)
    }
    return []
  }, [])

  useEffect(() => {
    loadTowns()
  }, [loadTowns])

  const buildTreeData = useCallback((): DataNode[] => {
    const allNode: DataNode = {
      title: (
        <Space>
          <UsergroupAddOutlined />
          <span>全部领证</span>
        </Space>
      ),
      key: 'all',
      icon: <UsergroupAddOutlined />,
    }

    const townNodes: DataNode[] = towns.map((town) => ({
      title: (
        <Space>
          <EnvironmentOutlined />
          <span>{town.name}</span>
        </Space>
      ),
      key: `town-${town.id}`,
      icon: <EnvironmentOutlined />,
      isLeaf: false,
      children: town.children?.map((village) => ({
        title: (
          <Space>
            <HomeOutlined />
            <span>{village.name}</span>
          </Space>
        ),
        key: `village-${village.id}`,
        icon: <HomeOutlined />,
        isLeaf: true,
      })),
    }))

    return [allNode, ...townNodes]
  }, [towns])

  const onTreeSelect = (selectedKeys: React.Key[]) => {
    if (selectedKeys.length === 0) return

    const key = selectedKeys[0] as string

    if (key === 'all') {
      setSelectedTownId('')
      setSelectedVillageId('')
      setCurrentPage(1)
      loadRecords(1, pageSize, '', '', '')
      return
    }

    if (key.startsWith('town-')) {
      const townId = key.replace('town-', '')
      setSelectedTownId(townId)
      setSelectedVillageId('')
      setCurrentPage(1)
      loadRecords(1, pageSize, '', townId, '')
      return
    }

    if (key.startsWith('village-')) {
      const villageId = key.replace('village-', '')
      const matchedTown = towns.find((town) =>
        town.children?.some((village) => village.id === villageId),
      )
      setSelectedTownId(matchedTown?.id || '')
      setSelectedVillageId(villageId)
      setCurrentPage(1)
      loadRecords(1, pageSize, '', matchedTown?.id || '', villageId)
    }
  }

  const onLoadData = async ({ key }: { key: React.Key }) => {
    const keyStr = key as string
    if (!keyStr.startsWith('town-')) return

    const townId = keyStr.replace('town-', '')
    const villages = await loadVillages(townId)

    setTowns((prev) =>
      prev.map((town) => (town.id === townId ? { ...town, children: villages } : town)),
    )
  }

  const treeData = useMemo(() => buildTreeData(), [buildTreeData])
  const selectedTreeKeys = useMemo(() => {
    if (selectedVillageId) return [`village-${selectedVillageId}`]
    if (selectedTownId) return [`town-${selectedTownId}`]
    return ['all']
  }, [selectedTownId, selectedVillageId])

  const lookupBdcByKeyword = useCallback(async (keyword: string) => {
    const normalized = keyword.trim()
    if (!normalized) {
      message.warning('请输入证书编号、身份证号或手机号')
      return null
    }

    const query = new URLSearchParams()
    if (PHONE_REGEX.test(normalized)) {
      query.set('phone', normalized)
    } else if (ID_CARD_REGEX.test(normalized)) {
      query.set('idCard', normalized)
    } else {
      query.set('certNo', normalizeCertNo(normalized))
    }

    setLookupLoading(true)
    try {
      const res = await authFetch(`/api/bdc/query?${query.toString()}`)
      if (!res.ok) {
        if (res.status === 401) {
          message.error('认证已过期，请重新登录')
          return null
        }
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const data = await res.json()
      if (!data.success) {
        message.error(data.error || '宅基地查询失败')
        return null
      }

      const bdcs = (data.data as Bdc[]) || []
      if (bdcs.length === 0) {
        message.warning('未找到对应的宅基地资料')
        setSelectedBdc(null)
        return null
      }

      if (bdcs.length > 1) {
        message.warning('匹配到多条宅基地资料，请使用证书编号精确查询')
        setSelectedBdc(null)
        return null
      }

      const [bdc] = bdcs

      setSelectedBdc(bdc)
      return bdc
    } catch (error) {
      console.error('Lookup BDC error:', error)
      message.error('查询宅基地资料失败')
      return null
    } finally {
      setLookupLoading(false)
    }
  }, [])

  useEffect(() => {
    const certNo = searchParams.get('certNo') || ''
    const idCard = searchParams.get('idCard') || ''
    const phone = searchParams.get('phone') || ''
    const initialKeyword = certNo || idCard || phone

    if (!initialKeyword) {
      return
    }

    setCreateModalVisible(true)
    createForm.setFieldsValue({ certNo: initialKeyword })
    setSelectedBdc(null)
    void lookupBdcByKeyword(initialKeyword)
  }, [createForm, lookupBdcByKeyword, searchParams])

  const handleCreateReceive = async (values: { certNo: string; remark?: string }) => {
    const keyword = normalizeCertNo(values.certNo)
    if (!keyword) {
      message.warning('请输入证书编号、身份证号或手机号')
      return
    }

    setCreateLoading(true)
    try {
      const res = await authFetch('/api/receive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          certNo: keyword,
          remark: values.remark,
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
        message.success('已自动关联宅基地并创建领证记录')
        setCreateModalVisible(false)
        createForm.resetFields()
        setSelectedBdc(null)
        loadRecords(currentPage, pageSize, '', selectedTownId, selectedVillageId)
      } else {
        message.error(data.error || '创建失败')
      }
    } catch (error) {
      console.error('Create receive error:', error)
      message.error('创建领证记录失败')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleReceive = async (values: {
    receiverName?: string
    receiverIdCard?: string
    receiverPhone?: string
    remark?: string
  }) => {
    if (!selectedRecord) return

    try {
      const res = await authFetch(`/api/receive/${selectedRecord.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...values,
          action: 'receive',
          idCardFrontPhoto: idCardFront,
          idCardBackPhoto: idCardBack,
          scenePhoto: scenePhoto,
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
        message.success('领取完成')
        setReceiveModalVisible(false)
        receiveForm.resetFields()
        setIdCardFront('')
        setIdCardBack('')
        setScenePhoto('')
        loadRecords(currentPage, pageSize, '', selectedTownId, selectedVillageId)
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Receive error:', error)
      message.error('操作失败')
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
      const requiredFields = ['certNo']
      const validation = validateExcelData(data, requiredFields)

      if (!validation.valid) {
        message.error('数据验证失败：' + validation.errors.slice(0, 3).join('；'))
        return false
      }

      setParsedData(data)
      setImportRows([])
      setImportSummary(null)
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

  const toOptionalText = (value: unknown) => {
    if (value === null || value === undefined) return undefined
    const text = String(value).trim()
    return text || undefined
  }

  const toOptionalCell = (value: unknown) => {
    if (value === null || value === undefined) return undefined
    if (typeof value === 'string' && value.trim() === '') return undefined
    return value
  }

  const BATCH_IMPORT_SIZE = 100

  const chunkArray = <T,>(array: T[], size: number) => {
    const chunks: T[][] = []
    for (let index = 0; index < array.length; index += size) {
      chunks.push(array.slice(index, index + size))
    }
    return chunks
  }

  const submitImportBatch = async (items: Record<string, unknown>[], rowOffset: number) => {
    const res = await authFetch('/api/receive/batch-import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items }),
    })

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('认证已过期，请重新登录')
      }
      throw new Error(`HTTP error! status: ${res.status}`)
    }

    const data = await res.json()
    if (!data.success) {
      throw new Error(data.error || '导入失败')
    }

    const rows = ((data.data?.rows || []) as ImportRowLog[]).map((row) => ({
      ...row,
      rowNo: row.rowNo + rowOffset,
    }))

    return {
      successCount: Number(data.data?.successCount || 0),
      failedCount: Number(data.data?.failedCount || 0),
      rows,
    }
  }

  // 提交 Excel 数据到后端
  const handleSubmitExcel = async () => {
    if (parsedData.length === 0) {
      message.error('请先上传 Excel 文件')
      return
    }

    setUploadLoading(true)
    try {
      // 转换数据格式
      const items = parsedData.map((row) => ({
        certNo: normalizeCertNo(row.certNo),
        ownerName: toOptionalText(row.ownerName),
        address: toOptionalText(row.address),
        area: toOptionalCell(row.area),
        receiverName: toOptionalText(row.receiverName),
        receiverIdCard: toOptionalText(row.receiverIdCard),
        receiverPhone: toOptionalText(row.receiverPhone),
        issueDate: toOptionalCell(row.issueDate),
        receiveDate: toOptionalCell(row.receiveDate),
        signedBy: toOptionalText(row.signedBy),
        signedDate: toOptionalCell(row.signedDate),
        status: toOptionalText(row.status),
        remark: toOptionalText(row.remark),
      }))

      const batches = chunkArray(items, BATCH_IMPORT_SIZE)
      const allRows: ImportRowLog[] = []
      let successCount = 0
      let failedCount = 0

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batchItems = batches[batchIndex]
        const batchOffset = batchIndex * BATCH_IMPORT_SIZE
        message.open({
          type: 'loading',
          content: `正在导入第 ${batchIndex + 1}/${batches.length} 批`,
          key: 'batch-import',
          duration: 0,
        })

        try {
          const batchResult = await submitImportBatch(batchItems, batchOffset)
          successCount += batchResult.successCount
          failedCount += batchResult.failedCount
          allRows.push(...batchResult.rows)
        } catch (error) {
          setImportRows(allRows)
          setImportSummary({
            total: parsedData.length,
            successCount,
            failedCount,
          })
          throw error
        }
      }

      setImportRows(allRows)
      setImportSummary({
        total: parsedData.length,
        successCount,
        failedCount,
      })

      if (failedCount > 0) {
        message.warning({
          content: `导入完成：成功 ${successCount}，失败 ${failedCount}`,
          key: 'batch-import',
        })
      } else {
        message.success({
          content: `导入完成：成功 ${successCount}，失败 ${failedCount}`,
          key: 'batch-import',
        })
      }

      if (failedCount > 0) {
        message.warning(`${failedCount} 条数据导入失败，请检查下方日志`)
      }

      loadRecords(currentPage, pageSize, '', selectedTownId, selectedVillageId)
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
        { key: 'certNo', title: '不动产证号', example: '粤(2022)惠州市不动产权第5015876号' },
        { key: 'ownerName', title: '权利人姓名', example: '张三' },
        { key: 'address', title: '房屋坐落', example: '选石龙乌石岗小组' },
        { key: 'area', title: '宗地面积(㎡)', example: '89.96' },
        { key: 'receiverName', title: '领证人签名', example: '张三' },
        { key: 'receiveDate', title: '签收时间', example: '2024-01-02' },
        { key: 'remark', title: '备注', example: '示例备注' },
      ],
      '领证管理导入模板',
    )
    message.success('模板下载成功')
  }

  const formatExcelPreviewCell = (value: unknown) => {
    if (value === null || value === undefined || value === '') return '-'
    if (typeof value === 'number' || value instanceof Date) {
      const date = dayjs(value)
      return date.isValid() ? date.format('YYYY-MM-DD HH:mm:ss') : String(value)
    }
    const text = String(value).trim()
    if (!text) return '-'
    const date = dayjs(text)
    return date.isValid() && /[-/:]/.test(text) ? date.format('YYYY-MM-DD HH:mm:ss') : text
  }

  const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = (error) => reject(error)
    })
  }

  const handlePhotoUpload = async (file: File, category: 'front' | 'back' | 'scene') => {
    try {
      const base64 = await getBase64(file)
      // TODO: 实际应该使用 browser-image-compression 压缩图片
      const compressed = base64

      if (category === 'front') setIdCardFront(compressed)
      else if (category === 'back') setIdCardBack(compressed)
      else setScenePhoto(compressed)
    } catch (error) {
      console.error('Photo upload error:', error)
      message.error('图片上传失败')
    }
    return false // 阻止默认上传
  }

  const renderRowActions = useCallback(
    (record: ReceiveRecord) => (
      <Space wrap size={isMobile ? 6 : 8}>
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedRecord(record)
            setDetailVisible(true)
          }}
        >
          详情
        </Button>
        {record.status === 'ISSUED' && !record.hasObjection && (
          <Button
            size="small"
            type="primary"
            onClick={() => {
              setSelectedRecord(record)
              setReceiveModalVisible(true)
            }}
          >
            领取
          </Button>
        )}
      </Space>
    ),
    [isMobile],
  )

  const renderMobileCard = (record: ReceiveRecord) => {
    const status = STATUS_MAP[record.status]

    return (
      <Card key={record.id} size="small" style={{ borderRadius: 12, width: '100%' }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Tag color={status.color}>{status.text}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.bdc.certNo}
            </Text>
          </Space>

          <div style={{ fontWeight: 600, fontSize: 16 }}>{record.bdc.ownerName}</div>

          <Text type="secondary">
            {record.bdc.village.town.name} · {record.bdc.village.name}
          </Text>

          <Space size={12} wrap>
            <Text>领取人 {record.receiverName || '-'}</Text>
            <Text>申请 {dayjs(record.applyDate).format('YYYY-MM-DD')}</Text>
          </Space>

          <Text type={record.hasObjection && record.activeObjectionId ? 'danger' : 'secondary'}>
            {record.hasObjection && record.activeObjectionId ? '异议中' : '正常'}
          </Text>

          {renderRowActions(record)}
        </Space>
      </Card>
    )
  }

  // 使用 useMemo 避免每次渲染重新创建 columns
  const columns: ColumnsType<ReceiveRecord> = useMemo(
    () => [
      {
        title: '证书编号',
        dataIndex: ['bdc', 'certNo'],
        key: 'certNo',
        width: 150,
      },
      {
        title: '使用权人',
        dataIndex: ['bdc', 'ownerName'],
        key: 'ownerName',
        width: 100,
      },
      {
        title: '所属村居',
        key: 'village',
        render: (_, record) => `${record.bdc.village.town.name} - ${record.bdc.village.name}`,
      },
      {
        title: '领取人',
        dataIndex: 'receiverName',
        key: 'receiverName',
        width: 100,
        render: (name) => name || '-',
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: string) => {
          const config = STATUS_MAP[status]
          return <Tag color={config.color}>{config.text}</Tag>
        },
      },
      {
        title: '申请时间',
        dataIndex: 'applyDate',
        key: 'applyDate',
        width: 120,
        render: (date) => dayjs(date).format('YYYY-MM-DD'),
      },
      {
        title: '异议状态',
        dataIndex: 'hasObjection',
        key: 'hasObjection',
        width: 100,
        render: (hasObjection: boolean, record: ReceiveRecord) => {
          if (hasObjection && record.activeObjectionId) {
            return (
              <Button
                type="link"
                danger
                size="small"
                onClick={() => {
                  window.open(`/objection/${record.activeObjectionId}`, '_blank')
                }}
              >
                异议中
              </Button>
            )
          }
          return <Tag color="green">正常</Tag>
        },
      },
      {
        title: '操作',
        key: 'action',
        width: 150,
        render: (_, record) => renderRowActions(record),
      },
    ],
    [renderRowActions],
  )

  return (
    <PageContainer
      title="领证管理"
      extra={
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
            block={isMobile}
          >
            新建领证
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={() => setImportModalVisible(true)}
            block={isMobile}
          >
            批量导入
          </Button>
        </Space>
      }
      loading={loading}
      skeleton={{ active: true, paragraph: { rows: 10 } }}
    >
      <Row gutter={[16, 16]} style={{ width: '100%' }}>
        <Col xs={24} md={6}>
          <Card
            size="small"
            title="村居选择"
            bodyStyle={{ padding: 8 }}
            loading={treeLoading}
            style={isMobile ? undefined : { position: 'sticky', top: 16 }}
          >
            <Tree
              blockNode
              showLine
              selectedKeys={selectedTreeKeys}
              treeData={treeData}
              onSelect={onTreeSelect}
              loadData={onLoadData}
            />
          </Card>
        </Col>
        <Col xs={24} md={18}>
          <Card size="small" title="领证列表" bodyStyle={{ padding: 0 }}>
            {isMobile ? (
              <Space direction="vertical" size={12} style={{ width: '100%', padding: 12 }}>
                {records.map(renderMobileCard)}
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
                  <Pagination
                    current={currentPage}
                    pageSize={pageSize}
                    total={total}
                    showSizeChanger={false}
                    onChange={(page) => {
                      setCurrentPage(page)
                      loadRecords(page, pageSize, '', selectedTownId, selectedVillageId)
                    }}
                  />
                </div>
              </Space>
            ) : (
              <Table
                columns={columns}
                dataSource={records}
                rowKey="id"
                loading={loading}
                pagination={{
                  current: currentPage,
                  pageSize,
                  total,
                  onChange: (page, size) => {
                    setCurrentPage(page)
                    setPageSize(size)
                    loadRecords(page, size, '', selectedTownId, selectedVillageId)
                  },
                }}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* 新建领证模态框 */}
      <Modal
        title="新建领证记录"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false)
          createForm.resetFields()
          setSelectedBdc(null)
          router.replace('/lingzheng')
        }}
        onOk={() => createForm.submit()}
        okText="创建"
        confirmLoading={createLoading}
        width={isMobile ? 'calc(100vw - 24px)' : 760}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
      >
        <Alert
          message="自动关联宅基地资料"
          description="输入证书编号、身份证号或手机号后，系统会自动到宅基地档案里匹配资料并创建领证记录。"
          type="info"
          style={{ marginBottom: 16 }}
        />

        <Form form={createForm} layout="vertical" onFinish={handleCreateReceive}>
          <Form.Item
            name="certNo"
            label="宅基地关联信息"
            rules={[{ required: true, message: '请输入证书编号、身份证号或手机号' }]}
          >
            <Input.Search
              placeholder="请输入证书编号、身份证号或手机号"
              enterButton="查询并关联"
              loading={lookupLoading}
              onSearch={(value) => {
                void lookupBdcByKeyword(value)
              }}
            />
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="可填写领证备注" />
          </Form.Item>

          {selectedBdc && (
            <Descriptions bordered size="small" column={isMobile ? 1 : 2}>
              <Descriptions.Item label="证书编号">{selectedBdc.certNo}</Descriptions.Item>
              <Descriptions.Item label="使用权人">{selectedBdc.ownerName}</Descriptions.Item>
              <Descriptions.Item label="所属村居">
                {selectedBdc.village.town.name} - {selectedBdc.village.name}
              </Descriptions.Item>
              <Descriptions.Item label="地址" span={isMobile ? 1 : 2}>
                {selectedBdc.address}
              </Descriptions.Item>
              <Descriptions.Item label="身份证号">{selectedBdc.idCard || '-'}</Descriptions.Item>
              <Descriptions.Item label="手机号">{selectedBdc.phone || '-'}</Descriptions.Item>
            </Descriptions>
          )}

          <Space style={{ marginTop: 16 }} wrap>
            <Button
              onClick={() => {
                router.push('/bdc')
              }}
            >
              去宅基地档案里找
            </Button>
          </Space>
        </Form>
      </Modal>

      {/* 详情模态框 */}
      <Modal
        title="领证记录详情"
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false)
          setSelectedRecord(null)
        }}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 900}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
      >
        {selectedRecord && (
          <>
            <Descriptions bordered column={isMobile ? 1 : 2} style={{ marginBottom: 24 }}>
              <Descriptions.Item label="证书编号">{selectedRecord.bdc.certNo}</Descriptions.Item>
              <Descriptions.Item label="使用权人">{selectedRecord.bdc.ownerName}</Descriptions.Item>
              <Descriptions.Item label="所属村居">
                {selectedRecord.bdc.village.town.name} - {selectedRecord.bdc.village.name}
              </Descriptions.Item>
              <Descriptions.Item label="地址" span={2}>
                {selectedRecord.bdc.address}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[selectedRecord.status].color}>
                  {STATUS_MAP[selectedRecord.status].text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="领取人">
                {selectedRecord.receiverName || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="领取人身份证">
                {selectedRecord.receiverIdCard || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="领取人手机">
                {selectedRecord.receiverPhone || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="签收人">{selectedRecord.signedBy || '-'}</Descriptions.Item>
              <Descriptions.Item label="签收时间">
                {selectedRecord.signedDate
                  ? dayjs(selectedRecord.signedDate).format('YYYY-MM-DD HH:mm')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {selectedRecord.remark || '-'}
              </Descriptions.Item>
            </Descriptions>

            <Divider>流程追踪</Divider>
            <Steps
              direction="vertical"
              size="small"
              items={selectedRecord.processNodes.map((node) => ({
                title: node.nodeName,
                description: (
                  <span>
                    {node.description}
                    {node.operatorName && ` - ${node.operatorName}`}
                    <br />
                    {dayjs(node.createdAt).format('YYYY-MM-DD HH:mm')}
                  </span>
                ),
                status:
                  node.nodeType === 'COMPLETE'
                    ? 'finish'
                    : node.nodeType === 'OBJECTION'
                      ? 'error'
                      : 'wait',
                icon:
                  node.nodeType === 'COMPLETE' ? (
                    <CheckCircleOutlined />
                  ) : node.nodeType === 'OBJECTION' ? (
                    <CloseCircleOutlined />
                  ) : undefined,
              }))}
            />
          </>
        )}
      </Modal>

      {/* 领取模态框 */}
      <Modal
        title="领取证书"
        open={receiveModalVisible}
        onCancel={() => {
          setReceiveModalVisible(false)
          receiveForm.resetFields()
          setIdCardFront('')
          setIdCardBack('')
          setScenePhoto('')
        }}
        onOk={() => receiveForm.submit()}
        width={isMobile ? 'calc(100vw - 24px)' : 700}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
      >
        <Alert
          message="领证流程"
          description="权利人来领证 → 核查权利人信息（身份证）→ 领证人拍照留底 → 完成领证"
          type="info"
          style={{ marginBottom: 16 }}
        />

        <Form form={receiveForm} layout="vertical" onFinish={handleReceive}>
          <Form.Item
            name="receiverName"
            label="领取人姓名"
            rules={[{ required: true, message: '请输入领取人姓名' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="receiverIdCard"
            label="领取人身份证号"
            rules={[
              { required: true, message: '请输入身份证号' },
              { len: 18, message: '身份证号格式不正确' },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item name="receiverPhone" label="领取人手机号">
            <Input />
          </Form.Item>

          <Divider>证件照片</Divider>

          <Space
            direction={isMobile ? 'vertical' : 'horizontal'}
            style={{ marginBottom: 16, width: '100%' }}
          >
            <Upload
              beforeUpload={(file) => handlePhotoUpload(file, 'front')}
              showUploadList={false}
            >
              <Button icon={<UploadOutlined />} block={isMobile}>
                {idCardFront ? '已上传' : '身份证正面'}
              </Button>
            </Upload>
            <Upload beforeUpload={(file) => handlePhotoUpload(file, 'back')} showUploadList={false}>
              <Button icon={<UploadOutlined />} block={isMobile}>
                {idCardBack ? '已上传' : '身份证背面'}
              </Button>
            </Upload>
          </Space>

          <Divider>现场拍照</Divider>

          <Form.Item label="领证人现场拍照">
            <Upload
              beforeUpload={(file) => handlePhotoUpload(file, 'scene')}
              showUploadList={false}
            >
              <Button icon={<CameraOutlined />} block={isMobile}>
                {scenePhoto ? '已拍照' : '拍照'}
              </Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入模态框 */}
      <Modal
        title="批量导入领证记录"
        open={importModalVisible}
        onCancel={() => {
          setImportModalVisible(false)
          setExcelFile(null)
          setParsedData([])
          setPreviewVisible(false)
          setImportRows([])
          setImportSummary(null)
          importForm.resetFields()
        }}
        footer={
          <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate} block={isMobile}>
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
              block={isMobile}
            >
              {previewVisible ? '隐藏预览' : '预览数据'} ({parsedData.length} 条)
            </Button>
            <Button
              onClick={() => {
                setImportModalVisible(false)
                setExcelFile(null)
                setParsedData([])
                setPreviewVisible(false)
                setImportRows([])
                setImportSummary(null)
                importForm.resetFields()
              }}
              block={isMobile}
            >
              取消
            </Button>
            <Button
              type="primary"
              loading={uploadLoading}
              onClick={handleSubmitExcel}
              disabled={parsedData.length === 0}
              block={isMobile}
            >
              确认导入
            </Button>
          </Space>
        }
        width={isMobile ? 'calc(100vw - 24px)' : 800}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
      >
        <Alert
          message="导入说明"
          description="请上传 Excel 文件（.xlsx 或 .xls），系统会自动识别你这类旧电子签收薄的常见表头，例如不动产证号、权利人姓名、房屋坐落、宗地面积(㎡)、领证人签名、签收时间、备注。签收时间若填“已领/已签收”，也会按已完成处理。超过 100 条会自动分批导入。"
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
                  width: 200,
                },
                {
                  title: '权利人姓名',
                  dataIndex: 'ownerName',
                  key: 'ownerName',
                  width: 120,
                },
                {
                  title: '房屋坐落',
                  dataIndex: 'address',
                  key: 'address',
                  width: 180,
                },
                {
                  title: '宗地面积(㎡)',
                  dataIndex: 'area',
                  key: 'area',
                  width: 110,
                },
                {
                  title: '领证人签名',
                  dataIndex: 'receiverName',
                  key: 'receiverName',
                  width: 120,
                },
                {
                  title: '签收时间',
                  dataIndex: 'receiveDate',
                  key: 'receiveDate',
                  width: 140,
                  render: formatExcelPreviewCell,
                },
                {
                  title: '备注',
                  dataIndex: 'remark',
                  key: 'remark',
                  width: 200,
                },
              ]}
            />
          </div>
        )}

        {importSummary && importRows.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Alert
              type={importSummary.failedCount > 0 ? 'warning' : 'success'}
              showIcon
              message={
                importSummary.failedCount > 0
                  ? `导入完成：共 ${importSummary.total} 条，成功 ${importSummary.successCount} 条，失败 ${importSummary.failedCount} 条`
                  : `导入完成：共 ${importSummary.total} 条，全部成功`
              }
              style={{ marginBottom: 12 }}
            />
            {importRows.some((row) => row.status === 'FAILED') ? (
              <Table
                size="small"
                rowKey={(record) => `${record.rowNo}-${record.certNo}`}
                pagination={false}
                scroll={{ y: 320 }}
                dataSource={importRows.filter((row) => row.status === 'FAILED')}
                columns={[
                  {
                    title: '行号',
                    dataIndex: 'rowNo',
                    width: 70,
                  },
                  {
                    title: '证书编号',
                    dataIndex: 'certNo',
                    width: 200,
                  },
                  {
                    title: '权利人',
                    dataIndex: 'ownerName',
                    width: 120,
                    render: (value: string | undefined) => value || '-',
                  },
                  {
                    title: '失败原因',
                    dataIndex: 'reason',
                    render: (value: string | undefined) => value || '-',
                  },
                ]}
              />
            ) : null}
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}
