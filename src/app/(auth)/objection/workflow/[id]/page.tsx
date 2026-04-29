'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Steps,
  Select,
  Switch,
  message,
  Spin,
  Typography,
  Divider,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import PageContainer from '@/components/PageContainer'
import { authFetch } from '@/lib/api-fetch'

const { Text } = Typography

interface WorkflowStep {
  stepOrder: number
  stepName: string
  stepType: string
  approverRole?: string
  isRequired: boolean
}

interface Workflow {
  id: string
  name: string
  description?: string
  isActive: boolean
  steps: WorkflowStep[]
}

const STEP_TYPES = [
  { value: 'SUBMIT', label: '提交' },
  { value: 'REVIEW', label: '审核' },
  { value: 'RE_REVIEW', label: '复核' },
  { value: 'FINAL', label: '最终处理' },
]

export default function WorkflowEditPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [form] = Form.useForm()
  const isNew = params.id === 'new'

  useEffect(() => {
    if (!isNew && params.id) {
      loadWorkflow()
    }
  }, [params.id])

  const loadWorkflow = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/objection-workflow/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setWorkflow(data.data)
        form.setFieldsValue(data.data)
      } else {
        message.error('加载流程失败')
      }
    } catch (error) {
      console.error('Load workflow error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      const res = await authFetch(
        isNew ? '/api/objection-workflow' : `/api/objection-workflow/${params.id}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        },
      )

      if (res.ok) {
        message.success(isNew ? '创建成功' : '保存成功')
        router.push('/objection/workflow')
      } else {
        const error = await res.json()
        message.error(error.error || '操作失败')
      }
    } catch (error) {
      console.error('Save error:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PageContainer title={isNew ? '新建流程' : '编辑流程'}>
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer
      title={isNew ? '新建流程' : '编辑流程'}
      extra={[
        <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
          返回
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
        >
          保存
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Card title="基本信息">
          <Form.Item
            name="name"
            label="流程名称"
            rules={[{ required: true, message: '请输入流程名称' }]}
          >
            <Input placeholder="请输入流程名称" maxLength={50} />
          </Form.Item>
          <Form.Item name="description" label="流程描述">
            <Input.TextArea placeholder="请输入流程描述（可选）" maxLength={200} rows={3} />
          </Form.Item>
          {!isNew && (
            <Form.Item name="isActive" label="是否启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Card>

        <Card title="流程步骤">
          <Form.List name="steps">
            {(fields, { add, remove }) => (
              <>
                <Steps
                  direction="vertical"
                  size="small"
                  current={fields.length}
                  items={fields.map((field, index) => ({
                    title: `第 ${index + 1} 步`,
                    description: form.getFieldValue(['steps', field.name, 'stepName']) || '未填写',
                  }))}
                />
                <Divider />
                {fields.map(({ key, name, ...restField }) => (
                  <Card key={key} size="small" style={{ marginBottom: 16 }}>
                    <Space align="start" wrap>
                      <Form.Item
                        {...restField}
                        name={[name, 'stepOrder']}
                        initialValue={name + 1}
                        style={{ display: 'none' }}
                      >
                        <Input type="hidden" />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'stepName']}
                        label="步骤名称"
                        rules={[{ required: true, message: '请输入步骤名称' }]}
                      >
                        <Input placeholder="如：初审" style={{ width: 120 }} maxLength={20} />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'stepType']}
                        label="步骤类型"
                        rules={[{ required: true, message: '请选择步骤类型' }]}
                      >
                        <Select placeholder="选择类型" style={{ width: 120 }}>
                          {STEP_TYPES.map((type) => (
                            <Select.Option key={type.value} value={type.value}>
                              {type.label}
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                      <Form.Item {...restField} name={[name, 'approverRole']} label="审批角色">
                        <Select placeholder="选择角色（可选）" style={{ width: 120 }} allowClear>
                          <Select.Option value="ADMIN">管理员</Select.Option>
                          <Select.Option value="OBJECTION_HANDLER">异议处理员</Select.Option>
                          <Select.Option value="RECEIVE_CLERK">领证员</Select.Option>
                        </Select>
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'isRequired']}
                        label="是否必填"
                        valuePropName="checked"
                      >
                        <Switch defaultChecked />
                      </Form.Item>
                      <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                        disabled={fields.length <= 1}
                      >
                        删除
                      </Button>
                    </Space>
                  </Card>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  添加步骤
                </Button>
              </>
            )}
          </Form.List>
        </Card>
      </Form>
    </PageContainer>
  )
}
