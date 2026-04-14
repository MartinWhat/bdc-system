'use client'

import { useState, useEffect, useCallback } from 'react'
import {
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
  Popconfirm,
  Descriptions,
  DatePicker,
} from 'antd'
import { PlusOutlined, EyeOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import TownVillageCascader from '@/components/TownVillageCascader'
import PageContainer from '@/components/PageContainer'
import dayjs from 'dayjs'

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
}

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待审核', color: 'orange' },
  APPROVED: { text: '已审核', color: 'blue' },
  ISSUED: { text: '已发放', color: 'geekblue' },
  COMPLETED: { text: '已完成', color: 'green' },
  CANCELLED: { text: '已注销', color: 'red' },
}

const LAND_USE_TYPES = ['宅基地', '农用地', '建设用地', '未利用地']

export default function BdcPage() {
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

  const loadBdcs = useCallback(async (page = 1, size = 10, keyword = '') => {
    setLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const res = await fetch(`/api/bdc?page=${page}&pageSize=${size}&keyword=${keyword}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      })
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
  }, [])

  useEffect(() => {
    loadBdcs()
  }, [])

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

      const res = await fetch(url, {
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

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/bdc/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        message.success('删除成功')
        loadBdcs()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/bdc/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (data.success) {
        message.success('状态已更新')
        loadBdcs()
      } else {
        message.error(data.error)
      }
    } catch (error) {
      message.error('状态更新失败')
    }
  }

  const handleQuery = async (values: { idCard?: string; phone?: string }) => {
    try {
      const params = new URLSearchParams()
      if (values.idCard) params.append('idCard', values.idCard)
      if (values.phone) params.append('phone', values.phone)

      const res = await fetch(`/api/bdc/query?${params}`)
      const data = await res.json()
      if (data.success) {
        setBdcs(data.data)
        setTotal(data.data.length)
      } else {
        message.error(data.error)
      }
    } catch (error) {
      console.error('Query error:', error)
      message.error('查询失败')
    }
  }

  const columns: ColumnsType<Bdc> = [
    {
      title: '证书编号',
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
      title: '面积(㎡)',
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
        return <Tag color={config.color}>{config.text}</Tag>
      },
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
              setDetailBdc(record)
              setDetailVisible(true)
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
          {record.status !== 'CANCELLED' && (
            <Popconfirm
              title="确认注销"
              description="注销后该档案将被标记为已注销状态"
              onConfirm={() => handleStatusChange(record.id, 'CANCELLED')}
            >
              <Button size="small" danger>
                注销
              </Button>
            </Popconfirm>
          )}
          {record.status === 'PENDING' && (
            <Button
              size="small"
              type="primary"
              onClick={() => handleStatusChange(record.id, 'APPROVED')}
            >
              审核
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <PageContainer
      title="宅基地管理"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
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
      <Form form={queryForm} layout="inline" onFinish={handleQuery} style={{ marginBottom: 16 }}>
        <Form.Item name="idCard" label="身份证号">
          <Input placeholder="输入身份证号查询" />
        </Form.Item>
        <Form.Item name="phone" label="手机号">
          <Input placeholder="输入手机号查询" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
            查询
          </Button>
          <Button
            style={{ marginLeft: 8 }}
            onClick={() => {
              queryForm.resetFields()
              loadBdcs()
            }}
          >
            重置
          </Button>
        </Form.Item>
      </Form>

      <Table
        columns={columns}
        dataSource={bdcs}
        rowKey="id"
        loading={loading}
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
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="certNo"
            label="证书编号"
            rules={[
              { required: true, message: '请输入证书编号' },
              { pattern: /^[0-9]+$/, message: '证书编号必须为数字' },
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
            label="面积（平方米）"
            rules={[
              { required: true, message: '请输入面积' },
              { type: 'number', min: 0, message: '面积必须大于 0' },
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
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}
      >
        {detailBdc && (
          <Descriptions bordered column={2}>
            <Descriptions.Item label="证书编号">{detailBdc.certNo}</Descriptions.Item>
            <Descriptions.Item label="使用权人">{detailBdc.ownerName}</Descriptions.Item>
            <Descriptions.Item label="身份证号">{detailBdc.idCard}</Descriptions.Item>
            <Descriptions.Item label="手机号">{detailBdc.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="地址" span={2}>
              {detailBdc.address}
            </Descriptions.Item>
            <Descriptions.Item label="面积">{detailBdc.area} ㎡</Descriptions.Item>
            <Descriptions.Item label="土地用途">{detailBdc.landUseType}</Descriptions.Item>
            <Descriptions.Item label="所属镇街">{detailBdc.village.town.name}</Descriptions.Item>
            <Descriptions.Item label="所属村居">{detailBdc.village.name}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={STATUS_MAP[detailBdc.status].color}>
                {STATUS_MAP[detailBdc.status].text}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="批准面积">
              {detailBdc.approvedArea ? `${detailBdc.approvedArea} ㎡` : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="批准日期">
              {detailBdc.approvedDate ? new Date(detailBdc.approvedDate).toLocaleDateString() : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="发证日期">
              {detailBdc.certIssuedDate
                ? new Date(detailBdc.certIssuedDate).toLocaleDateString()
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>
              {detailBdc.remark || '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </PageContainer>
  )
}
