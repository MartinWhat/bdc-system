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
  Steps,
  Upload,
  Divider,
  Alert,
  Typography,
} from 'antd'
import {
  EyeOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UploadOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'
import { parseExcelFile, downloadExcelTemplate, validateExcelData } from '@/lib/excel-parser'
import { authFetch } from '@/lib/api-fetch'

const { Text } = Typography

interface Village {
  id: string
  name: string
  town: { name: string }
}

interface Bdc {
  id: string
  certNo: string
  ownerName: string
  address: string
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

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待领证', color: 'orange' },
  ISSUED: { text: '已发放', color: 'blue' },
  COMPLETED: { text: '已完成', color: 'green' },
  OBJECTION: { text: '异议中', color: 'red' },
  CANCELLED: { text: '已取消', color: 'default' },
}

export default function LingzhengPage() {
  const [records, setRecords] = useState<ReceiveRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [receiveModalVisible, setReceiveModalVisible] = useState(false)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<ReceiveRecord | null>(null)
  const [receiveForm] = Form.useForm()
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
  const [uploadLoading, setUploadLoading] = useState(false)

  // 提取到组件外部避免每次渲染重新创建
  const loadRecords = useCallback(
    async (page = currentPage, size = pageSize, status = '') => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(size),
        })
        if (status) params.append('status', status)

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
    [currentPage, pageSize],
  )

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const handleIssue = useCallback(
    async (record: ReceiveRecord) => {
      try {
        const res = await authFetch(`/api/receive/${record.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'issue' }),
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
          message.success('已标记为发放')
          loadRecords()
        } else {
          message.error(data.error)
        }
      } catch (error) {
        console.error('Issue error:', error)
        message.error('操作失败')
      }
    },
    [loadRecords],
  )

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
        loadRecords()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Receive error:', error)
      message.error('操作失败')
    }
  }

  const handleBatchImport = async (values: { certNos: string; remark?: string }) => {
    try {
      const certNos = values.certNos
        .split('\n')
        .map((s: string) => s.trim())
        .filter((s: string) => s)

      const items = certNos.map((certNo: string) => ({ certNo, remark: values.remark || '' }))

      const res = await authFetch('/api/receive/batch-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        const { successCount, failedCount } = data.data
        message.success(`导入完成：成功 ${successCount}，失败 ${failedCount}`)
        setImportModalVisible(false)
        importForm.resetFields()
        loadRecords()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Batch import error:', error)
      message.error('导入失败')
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
      // 转换数据格式
      const items = parsedData.map((row) => ({
        certNo: String(row.certNo || ''),
        remark: String(row.remark || ''),
      }))

      const res = await authFetch('/api/receive/batch-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

        if (failedItems && failedItems.length > 0) {
          console.warn('失败的条目:', failedItems)
          message.warning(`${failedCount} 条数据导入失败，请检查后重新导入`)
        }

        // 重置状态
        setImportModalVisible(false)
        setExcelFile(null)
        setParsedData([])
        setPreviewVisible(false)
        importForm.resetFields()
        loadRecords()
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
        { key: 'remark', title: '备注', example: '示例备注' },
      ],
      '领证管理导入模板',
    )
    message.success('模板下载成功')
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
        render: (_, record) => (
          <Space>
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
      },
    ],
    [handleIssue],
  )

  return (
    <PageContainer
      title="领证管理"
      extra={
        <Button icon={<UploadOutlined />} onClick={() => setImportModalVisible(true)}>
          批量导入
        </Button>
      }
      dataSource={records}
      loading={loading}
      skeleton={{ active: true, paragraph: { rows: 10 } }}
      emptyDescription="暂无领证记录"
    >
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
            loadRecords(page, size)
          },
        }}
      />

      {/* 详情模态框 */}
      <Modal
        title="领证记录详情"
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false)
          setSelectedRecord(null)
        }}
        footer={null}
        width={900}
      >
        {selectedRecord && (
          <>
            <Descriptions bordered column={2} style={{ marginBottom: 24 }}>
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
        width={700}
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

          <Space style={{ marginBottom: 16 }}>
            <Upload
              beforeUpload={(file) => handlePhotoUpload(file, 'front')}
              showUploadList={false}
            >
              <Button icon={<UploadOutlined />}>{idCardFront ? '已上传' : '身份证正面'}</Button>
            </Upload>
            <Upload beforeUpload={(file) => handlePhotoUpload(file, 'back')} showUploadList={false}>
              <Button icon={<UploadOutlined />}>{idCardBack ? '已上传' : '身份证背面'}</Button>
            </Upload>
          </Space>

          <Divider>现场拍照</Divider>

          <Form.Item label="领证人现场拍照">
            <Upload
              beforeUpload={(file) => handlePhotoUpload(file, 'scene')}
              showUploadList={false}
            >
              <Button icon={<CameraOutlined />}>{scenePhoto ? '已拍照' : '拍照'}</Button>
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
          importForm.resetFields()
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
                setImportModalVisible(false)
                setExcelFile(null)
                setParsedData([])
                setPreviewVisible(false)
                importForm.resetFields()
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
        width={800}
      >
        <Alert
          message="导入说明"
          description="请上传 Excel 文件（.xlsx 或 .xls），支持中文表头。系统将根据证书编号生成待领证记录。最多支持 100 条数据。"
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
                  title: '备注',
                  dataIndex: 'remark',
                  key: 'remark',
                  width: 200,
                },
              ]}
            />
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}
