'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Grid,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Space,
  Tag,
  Descriptions,
  DatePicker,
  Tabs,
  Pagination,
  Typography,
} from 'antd'
import { PlusOutlined, EyeOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import PageContainer from '@/components/PageContainer'
import CollectiveAttachmentManager, {
  type CollectiveAttachment,
} from '@/components/collective/CollectiveAttachmentManager'
import { authFetch } from '@/lib/api-fetch'

interface Village {
  id: string
  name: string
  town: {
    name: string
  }
}

interface Bdc {
  id: string
  certNo: string
  ownerName: string
  idCard?: string
  phone?: string
  address: string
  area: number
  landUseType: string
  status: string
  approvedArea?: number
  approvedDate?: string
  certIssuedDate?: string
  remark?: string
  createdAt: string
  village: Village
  // 业务字段
  receiveId?: string
  businessTitle?: string
  applicant?: string
  acceptorName?: string
  acceptDate?: string
  businessNo?: string
  certNos?: string
  recorder?: string
  receiverName?: string
  receiveTime?: string
  issuerName?: string
  isRejected?: boolean
  rejectReason?: string
  originalAddress?: string
  attachments?: CollectiveAttachment[]
}

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待审核', color: 'orange' },
  APPROVED: { text: '已审核', color: 'blue' },
  ISSUED: { text: '已发放', color: 'geekblue' },
  COMPLETED: { text: '已完成', color: 'green' },
  CANCELLED: { text: '已注销', color: 'red' },
  RETURNED: { text: '已退件', color: 'volcano' },
}

const LAND_USE_TYPES = ['宅基地', '农用地', '建设用地', '未利用地']
const { Text } = Typography

export default function BdcPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [bdcs, setBdcs] = useState<Bdc[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingBdc, setEditingBdc] = useState<Bdc | null>(null)
  const [detailBdc, setDetailBdc] = useState<Bdc | null>(null)
  const [form] = Form.useForm()
  const [queryForm] = Form.useForm()
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [towns, setTowns] = useState<{ id: string; name: string }[]>([])
  const [villages, setVillages] = useState<{ id: string; name: string; townId: string }[]>([])
  const [selectedTownId, setSelectedTownId] = useState<string>('')

  const loadBdcs = useCallback(
    async (page = 1, size = 10) => {
      setLoading(true)
      try {
        const url = new URL(`/api/bdc`, window.location.origin)
        url.searchParams.set('page', String(page))
        url.searchParams.set('pageSize', String(size))
        // 附加查询条件
        const formValues = queryForm.getFieldsValue()
        if (formValues.keyword) url.searchParams.set('keyword', formValues.keyword)
        if (formValues.status) url.searchParams.set('status', formValues.status)
        if (formValues.townId) url.searchParams.set('townId', formValues.townId)
        if (formValues.villageId) url.searchParams.set('villageId', formValues.villageId)
        if (formValues.acceptDateRange) {
          url.searchParams.set('acceptDateFrom', formValues.acceptDateRange[0].format('YYYY-MM-DD'))
          url.searchParams.set('acceptDateTo', formValues.acceptDateRange[1].format('YYYY-MM-DD'))
        }
        const res = await authFetch(url.toString())
        const data = await res.json()
        if (data.success) {
          setBdcs(data.data.list)
          setTotal(data.data.total)
        } else {
          message.error(data.error || '加载失败')
        }
      } catch (error) {
        console.error('Load bdcs error:', error)
        message.error('加载宅基地列表失败')
      } finally {
        setLoading(false)
      }
    },
    [queryForm],
  )

  useEffect(() => {
    loadBdcs()
    // 加载镇街列表
    authFetch('/api/towns')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setTowns(data.data)
      })
      .catch(console.error)
  }, [loadBdcs])

  // 镇街变化时，重新加载村居列表
  useEffect(() => {
    if (!selectedTownId) {
      setVillages([])
      return
    }
    authFetch(`/api/villages?townId=${selectedTownId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setVillages(data.data)
      })
      .catch(console.error)
  }, [selectedTownId])

  const handleSubmit = async (values: {
    certNo: string
    ownerName: string
    idCard?: string
    phone?: string
    address: string
    area: number
    landUseType: string
    villageId: string
    remark?: string
  }) => {
    try {
      const url = editingBdc ? `/api/bdc/${editingBdc.id}` : '/api/bdc'
      const method = editingBdc ? 'PUT' : 'POST'

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const data = await res.json()

      if (data.success) {
        message.success(editingBdc ? '更新成功' : '创建成功')
        setModalVisible(false)
        form.resetFields()
        setEditingBdc(null)
        loadBdcs()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Submit error:', error)
      message.error('操作失败')
    }
  }

  const loadBdcDetail = useCallback(async (id: string) => {
    try {
      const res = await authFetch(`/api/bdc/${id}`)
      const data = await res.json()
      if (data.success) {
        setDetailBdc(data.data)
        setDetailVisible(true)
      } else {
        message.error(data.error || '加载详情失败')
      }
    } catch (error) {
      console.error('Load BDC detail error:', error)
      message.error('加载宅基地详情失败')
    }
  }, [])

  const handleQuery = async () => {
    setCurrentPage(1)
    loadBdcs(1, pageSize)
  }

  const columns: ColumnsType<Bdc> = [
    {
      title: '不动产单元号',
      dataIndex: 'certNo',
      key: 'certNo',
      width: 150,
    },
    {
      title: '使用权人',
      dataIndex: 'ownerName',
      key: 'ownerName',
      width: 100,
    },
    {
      title: '所属村居',
      key: 'village',
      render: (_, record) => `${record.village.town.name} - ${record.village.name}`,
    },
    {
      title: '建筑面积(㎡)',
      dataIndex: 'area',
      key: 'area',
      width: 100,
    },
    {
      title: '土地用途',
      dataIndex: 'landUseType',
      key: 'landUseType',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const config = STATUS_MAP[status]
        return config ? <Tag color={config.color}>{config.text}</Tag> : <Tag>{status}</Tag>
      },
    },
    {
      title: '业务标题',
      dataIndex: 'businessTitle',
      key: 'businessTitle',
      width: 180,
      ellipsis: true,
    },
    {
      title: '受理日期',
      dataIndex: 'acceptDate',
      key: 'acceptDate',
      width: 100,
      render: (val: string) => (val ? val.slice(0, 10) : '-'),
    },
    {
      title: '受理人',
      dataIndex: 'acceptorName',
      key: 'acceptorName',
      width: 80,
    },
    {
      title: '不动产权证书号',
      dataIndex: 'certNos',
      key: 'certNos',
      width: 200,
      ellipsis: true,
    },
    {
      title: '退件原因',
      dataIndex: 'rejectReason',
      key: 'rejectReason',
      width: 150,
      ellipsis: true,
    },
    {
      title: '领证人',
      dataIndex: 'receiverName',
      key: 'receiverName',
      width: 100,
      ellipsis: true,
    },
    {
      title: '领证时间',
      dataIndex: 'receiveTime',
      key: 'receiveTime',
      width: 100,
      render: (val: string) => (val ? val.slice(0, 10) : '-'),
    },
    {
      title: '发证人',
      dataIndex: 'issuerName',
      key: 'issuerName',
      width: 80,
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              loadBdcDetail(record.id)
            }}
          >
            详情
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingBdc(record)
              form.setFieldsValue(record)
              setModalVisible(true)
            }}
          >
            编辑
          </Button>
        </Space>
      ),
    },
  ]

  const renderMobileCard = (record: Bdc) => {
    const status = STATUS_MAP[record.status]

    return (
      <Card key={record.id} size="small" style={{ borderRadius: 12, width: '100%' }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space
            size={8}
            wrap
            style={{ width: '100%', minWidth: 0, justifyContent: 'space-between' }}
          >
            <Space size={8} wrap style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.35 }}>
                {record.ownerName}
              </div>
              <Tag
                color={status?.color || 'default'}
                style={{ marginRight: 0, width: 'fit-content' }}
              >
                {status?.text || record.status}
              </Tag>
            </Space>
            <Text
              type="secondary"
              style={{
                fontSize: 12,
                minWidth: 0,
                display: 'block',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                lineHeight: 1.4,
                flex: '1 1 auto',
                textAlign: 'right',
              }}
            >
              {record.village.town.name} · {record.village.name}
            </Text>
          </Space>

          <Text
            type="secondary"
            style={{
              fontSize: 12,
              width: '100%',
              minWidth: 0,
              display: 'block',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              lineHeight: 1.4,
            }}
          >
            不动产单元号：{record.certNo}
          </Text>

          <Space size={12} wrap>
            <Text>建筑面积 {record.area} ㎡</Text>
            <Text>用途 {record.landUseType}</Text>
          </Space>

          <Text
            type="secondary"
            style={{
              width: '100%',
              minWidth: 0,
              display: 'block',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              lineHeight: 1.4,
            }}
          >
            不动产权证书号：{record.certNos || record.certNo}
          </Text>

          <Text type="secondary" ellipsis={{ tooltip: record.address }}>
            地址：{record.address}
          </Text>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            <Button block onClick={() => loadBdcDetail(record.id)}>
              详情
            </Button>
            <Button
              block
              onClick={() => {
                setEditingBdc(record)
                form.setFieldsValue(record)
                setModalVisible(true)
              }}
            >
              编辑
            </Button>
          </div>
        </Space>
      </Card>
    )
  }

  return (
    <PageContainer
      title="宅基地管理"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          block={isMobile}
          onClick={() => {
            setEditingBdc(null)
            form.resetFields()
            setModalVisible(true)
          }}
        >
          创建档案
        </Button>
      }
      dataSource={bdcs}
      loading={loading}
      skeleton={{ active: true, paragraph: { rows: 10 } }}
      emptyDescription="暂无宅基地档案"
    >
      <Form
        form={queryForm}
        layout={isMobile ? 'vertical' : 'inline'}
        onFinish={handleQuery}
        style={{ marginBottom: 16 }}
      >
        <Form.Item name="keyword" label="关键字">
          <Input placeholder="姓名/证书/地址" style={{ width: isMobile ? '100%' : 140 }} />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select placeholder="全部" allowClear style={{ width: isMobile ? '100%' : 120 }}>
            <Select.Option value="PENDING">待审核</Select.Option>
            <Select.Option value="ISSUED">已发放</Select.Option>
            <Select.Option value="RETURNED">已退件</Select.Option>
            <Select.Option value="CANCELLED">已注销</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="townId" label="镇街">
          <Select
            placeholder="全部"
            allowClear
            style={{ width: isMobile ? '100%' : 140 }}
            onChange={(val) => {
              setSelectedTownId(val || '')
              queryForm.setFieldValue('villageId', undefined)
            }}
          >
            {towns.map((t) => (
              <Select.Option key={t.id} value={t.id}>
                {t.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="villageId" label="村居">
          <Select
            placeholder="全部"
            allowClear
            style={{ width: isMobile ? '100%' : 140 }}
            disabled={!selectedTownId}
          >
            {villages.map((v) => (
              <Select.Option key={v.id} value={v.id}>
                {v.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="acceptDateRange" label="受理日期">
          <DatePicker.RangePicker style={{ width: isMobile ? '100%' : 220 }} />
        </Form.Item>
        <Form.Item>
          <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} block={isMobile}>
              查询
            </Button>
            <Button
              block={isMobile}
              onClick={() => {
                queryForm.resetFields()
                setSelectedTownId('')
                loadBdcs()
              }}
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>

      {isMobile ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {bdcs.map(renderMobileCard)}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={total}
              showSizeChanger={false}
              onChange={(page) => {
                setCurrentPage(page)
                loadBdcs(page, pageSize)
              }}
            />
          </div>
        </Space>
      ) : (
        <Table
          columns={columns}
          dataSource={bdcs}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            onChange: (page, size) => {
              setCurrentPage(page)
              setPageSize(size)
              loadBdcs(page, size)
            },
          }}
        />
      )}

      {/* 创建/编辑模态框 */}
      <Modal
        title={editingBdc ? '编辑宅基地档案' : '创建宅基地档案'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          setEditingBdc(null)
          form.resetFields()
        }}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 800}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="certNo"
            label="不动产单元号"
            rules={[
              { required: true, message: '请输入不动产单元号' },
              { pattern: /^[0-9]+$/, message: '不动产单元号必须为数字' },
            ]}
          >
            <Input disabled={!!editingBdc} />
          </Form.Item>

          <Form.Item
            name="ownerName"
            label="使用权人姓名"
            rules={[
              { required: true, message: '请输入使用权人姓名' },
              { max: 50, message: '姓名不能超过 50 个字符' },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="idCard"
            label="身份证号"
            rules={[
              { required: true, message: '请输入身份证号' },
              { len: 18, message: '身份证号格式不正确' },
              {
                pattern:
                  /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/,
                message: '请输入正确的身份证号',
              },
            ]}
          >
            <Input disabled={!!editingBdc} />
          </Form.Item>

          <Form.Item name="phone" label="手机号">
            <Input placeholder="请输入手机号" maxLength={11} />
          </Form.Item>

          <Form.Item
            name="address"
            label="地址"
            rules={[
              { required: true, message: '请输入地址' },
              { max: 200, message: '地址不能超过 200 个字符' },
            ]}
          >
            <Input.TextArea rows={2} maxLength={200} />
          </Form.Item>

          <Form.Item
            name="area"
            label="建筑面积（平方米）"
            rules={[
              { required: true, message: '请输入建筑面积' },
              { type: 'number', min: 0, message: '建筑面积必须大于 0' },
            ]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="landUseType"
            label="土地用途"
            rules={[{ required: true, message: '请选择土地用途' }]}
          >
            <Select>
              {LAND_USE_TYPES.map((type) => (
                <Select.Option key={type} value={type}>
                  {type}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="approvedArea" label="批准面积（平方米）">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="approvedDate" label="批准日期">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {editingBdc ? '更新' : '创建'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情模态框 */}
      <Modal
        title="宅基地档案详情"
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false)
          setDetailBdc(null)
        }}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 1000}
        style={isMobile ? { top: 12 } : undefined}
        centered={!isMobile}
      >
        {detailBdc && (
          <Tabs
            defaultActiveKey="info"
            tabBarGutter={isMobile ? 12 : undefined}
            items={[
              {
                key: 'info',
                label: '档案信息',
                children: (
                  <Descriptions bordered column={isMobile ? 1 : 2}>
                    <Descriptions.Item label="不动产单元号">{detailBdc.certNo}</Descriptions.Item>
                    <Descriptions.Item label="使用权人">{detailBdc.ownerName}</Descriptions.Item>
                    <Descriptions.Item label="身份证号">{detailBdc.idCard}</Descriptions.Item>
                    <Descriptions.Item label="手机号">{detailBdc.phone || '-'}</Descriptions.Item>
                    <Descriptions.Item label="地址" span={2}>
                      {detailBdc.address}
                    </Descriptions.Item>
                    <Descriptions.Item label="建筑面积">{detailBdc.area} ㎡</Descriptions.Item>
                    <Descriptions.Item label="土地用途">{detailBdc.landUseType}</Descriptions.Item>
                    <Descriptions.Item label="所属镇街">
                      {detailBdc.village.town.name}
                    </Descriptions.Item>
                    <Descriptions.Item label="所属村居">{detailBdc.village.name}</Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <Tag color={STATUS_MAP[detailBdc.status]?.color}>
                        {STATUS_MAP[detailBdc.status]?.text}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="批准面积">
                      {detailBdc.approvedArea ? `${detailBdc.approvedArea} ㎡` : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="批准日期">
                      {detailBdc.approvedDate
                        ? new Date(detailBdc.approvedDate).toLocaleDateString()
                        : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="发证日期">
                      {detailBdc.certIssuedDate
                        ? new Date(detailBdc.certIssuedDate).toLocaleDateString()
                        : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="备注" span={2}>
                      {detailBdc.remark || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="收件编号">
                      {detailBdc.receiveId || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="业务标题" span={2}>
                      {detailBdc.businessTitle || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="申请人">
                      {detailBdc.applicant || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="受理人">
                      {detailBdc.acceptorName || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="受理日期">
                      {detailBdc.acceptDate
                        ? new Date(detailBdc.acceptDate).toLocaleDateString()
                        : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="业务受理号">
                      {detailBdc.businessNo || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="不动产权证书号" span={2}>
                      {detailBdc.certNos || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="登簿人">
                      {detailBdc.recorder || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="登记时间">
                      {detailBdc.certIssuedDate
                        ? new Date(detailBdc.certIssuedDate).toLocaleDateString()
                        : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="领证人">
                      {detailBdc.receiverName || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="领证时间">
                      {detailBdc.receiveTime
                        ? new Date(detailBdc.receiveTime).toLocaleDateString()
                        : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="发证人">
                      {detailBdc.issuerName || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="是否退件">
                      {detailBdc.isRejected ? <Tag color="red">是</Tag> : '否'}
                    </Descriptions.Item>
                    <Descriptions.Item label="退件原因" span={2}>
                      {detailBdc.rejectReason || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="原坐落" span={2}>
                      {detailBdc.originalAddress || '-'}
                    </Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: 'attachments',
                label: `附件管理 (${detailBdc.attachments?.length || 0})`,
                children: (
                  <CollectiveAttachmentManager
                    bdcId={detailBdc.id}
                    certificateFamily="BDC"
                    attachments={detailBdc.attachments || []}
                    onChanged={async () => {
                      await loadBdcDetail(detailBdc.id)
                    }}
                  />
                ),
              },
            ]}
          />
        )}
      </Modal>
    </PageContainer>
  )
}
