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
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import PageContainer from '@/components/PageContainer'

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
  const [objectionModalVisible, setObjectionModalVisible] = useState(false)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<ReceiveRecord | null>(null)
  const [receiveForm] = Form.useForm()
  const [objectionForm] = Form.useForm()
  const [importForm] = Form.useForm()
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [idCardFront, setIdCardFront] = useState<string>('')
  const [idCardBack, setIdCardBack] = useState<string>('')
  const [scenePhoto, setScenePhoto] = useState<string>('')

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

        const token = localStorage.getItem('token')
        const res = await fetch(`/api/receive?${params}`, {
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
        const token = localStorage.getItem('token')
        const res = await fetch(`/api/receive/${record.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
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
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/receive/${selectedRecord.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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

  const handleObjection = async (values: { objectionType: string; description: string }) => {
    if (!selectedRecord) return

    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/objection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiveRecordId: selectedRecord.id,
          objectionType: values.objectionType,
          description: values.description,
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
        message.success('异议已登记')
        setObjectionModalVisible(false)
        objectionForm.resetFields()
        loadRecords()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Objection error:', error)
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

      const token = localStorage.getItem('token')
      const res = await fetch('/api/receive/batch-import', {
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
        title: '操作',
        key: 'action',
        width: 200,
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
            {record.status === 'PENDING' && (
              <Button size="small" type="primary" onClick={() => handleIssue(record)}>
                发放
              </Button>
            )}
            {record.status === 'ISSUED' && (
              <>
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
                <Button
                  size="small"
                  danger
                  icon={<ExclamationCircleOutlined />}
                  onClick={() => {
                    setSelectedRecord(record)
                    setObjectionModalVisible(true)
                  }}
                >
                  异议
                </Button>
              </>
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

      {/* 异议模态框 */}
      <Modal
        title="登记异议"
        open={objectionModalVisible}
        onCancel={() => {
          setObjectionModalVisible(false)
          objectionForm.resetFields()
        }}
        onOk={() => objectionForm.submit()}
      >
        <Form form={objectionForm} layout="vertical" onFinish={handleObjection}>
          <Form.Item
            name="objectionType"
            label="异议类型"
            rules={[{ required: true, message: '请选择异议类型' }]}
          >
            <Select>
              <Select.Option value="NAME_ERROR">姓名错误</Select.Option>
              <Select.Option value="ID_CARD_ERROR">身份证错误</Select.Option>
              <Select.Option value="AREA_ERROR">面积错误</Select.Option>
              <Select.Option value="OTHER">其他</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="description"
            label="异议描述"
            rules={[{ required: true, message: '请输入异议描述' }]}
          >
            <Input.TextArea rows={4} placeholder="请详细描述异议内容" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入模态框 */}
      <Modal
        title="批量导入领证记录"
        open={importModalVisible}
        onCancel={() => {
          setImportModalVisible(false)
          importForm.resetFields()
        }}
        onOk={() => importForm.submit()}
        width={600}
      >
        <Alert
          message="导入说明"
          description="每行输入一个证书编号，系统将根据证书编号查找宅基地并生成待领证记录。证从上级交接回来后导入，才进入待领证状态。"
          type="info"
          style={{ marginBottom: 16 }}
        />

        <Form form={importForm} layout="vertical" onFinish={handleBatchImport}>
          <Form.Item
            name="certNos"
            label="证书编号列表"
            rules={[{ required: true, message: '请输入证书编号' }]}
          >
            <Input.TextArea
              rows={10}
              placeholder="每行一个证书编号，例如：
3301010010010001
3301010010010002
3301010010010003"
            />
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="可选备注" />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  )
}
