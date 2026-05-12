'use client'

type Point = { x: number; y: number }

interface CvMat {
  rows: number
  cols: number
  data32S: Int32Array
  delete(): void
}

interface CvMatVector {
  size(): number
  get(index: number): CvMat
  delete(): void
}

interface OpenCvModule {
  Mat: new () => CvMat
  MatVector: new () => CvMatVector
  Size: new (width: number, height: number) => unknown
  Scalar: new (...args: number[]) => unknown
  COLOR_RGBA2GRAY: number
  BORDER_DEFAULT: number
  BORDER_REPLICATE: number
  INTER_LINEAR: number
  MORPH_RECT: number
  MORPH_CLOSE: number
  RETR_LIST: number
  CHAIN_APPROX_SIMPLE: number
  CV_32FC2: number
  imread(canvas: HTMLCanvasElement): CvMat
  imshow(canvas: HTMLCanvasElement, mat: CvMat): void
  cvtColor(src: CvMat, dst: CvMat, code: number): void
  GaussianBlur(
    src: CvMat,
    dst: CvMat,
    ksize: unknown,
    sigmaX: number,
    sigmaY: number,
    borderType: number,
  ): void
  Canny(src: CvMat, dst: CvMat, threshold1: number, threshold2: number): void
  getStructuringElement(shape: number, ksize: unknown): CvMat
  morphologyEx(src: CvMat, dst: CvMat, op: number, kernel: CvMat): void
  findContours(
    image: CvMat,
    contours: CvMatVector,
    hierarchy: CvMat,
    mode: number,
    method: number,
  ): void
  contourArea(contour: CvMat): number
  arcLength(curve: CvMat, closed: boolean): number
  approxPolyDP(curve: CvMat, approxCurve: CvMat, epsilon: number, closed: boolean): void
  matFromArray(rows: number, cols: number, type: number, array: number[]): CvMat
  getPerspectiveTransform(src: CvMat, dst: CvMat): CvMat
  warpPerspective(
    src: CvMat,
    dst: CvMat,
    matrix: CvMat,
    dsize: unknown,
    flags: number,
    borderMode: number,
    borderValue: unknown,
  ): void
  onRuntimeInitialized?: () => void
}

export interface DocumentCropResult {
  originalFile: File
  originalPreviewUrl: string
  processedFile: File
  processedPreviewUrl: string
  detected: boolean
}

let openCvLoadPromise: Promise<void> | null = null

function getOpenCv(): OpenCvModule | null {
  if (typeof window === 'undefined') return null
  return (window as typeof window & { cv?: OpenCvModule }).cv ?? null
}

export function loadOpenCv(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV.js can only load in the browser'))
  }

  const existingCv = getOpenCv()
  if (existingCv?.Mat) {
    return Promise.resolve()
  }

  if (!openCvLoadPromise) {
    openCvLoadPromise = new Promise<void>((resolve, reject) => {
      const ready = () => {
        const cv = getOpenCv()
        if (!cv) {
          reject(new Error('OpenCV.js 加载失败'))
          return
        }

        if (cv.Mat) {
          resolve(undefined)
          return
        }

        cv.onRuntimeInitialized = () => resolve(undefined)
      }

      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[data-opencv-js="true"]',
      )

      if (existingScript) {
        existingScript.addEventListener('load', ready, { once: true })
        existingScript.addEventListener('error', () => reject(new Error('OpenCV.js 加载失败')), {
          once: true,
        })
        ready()
        return
      }

      const script = document.createElement('script')
      script.src = 'https://docs.opencv.org/4.x/opencv.js'
      script.async = true
      script.dataset.opencvJs = 'true'
      script.onload = ready
      script.onerror = () => reject(new Error('OpenCV.js 加载失败'))
      document.head.appendChild(script)
    }).catch((error) => {
      openCvLoadPromise = null
      throw error
    })
  }

  return openCvLoadPromise as Promise<void>
}

function orderPoints(points: Point[]): [Point, Point, Point, Point] {
  const sortedBySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y))
  const sortedByDiff = [...points].sort((a, b) => a.x - a.y - (b.x - b.y))

  const topLeft = sortedBySum[0]
  const bottomRight = sortedBySum[sortedBySum.length - 1]
  const topRight = sortedByDiff[0]
  const bottomLeft = sortedByDiff[sortedByDiff.length - 1]

  return [topLeft, topRight, bottomRight, bottomLeft]
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function matToPoints(mat: CvMat): Point[] {
  const points: Point[] = []
  for (let i = 0; i < mat.data32S.length; i += 2) {
    points.push({ x: mat.data32S[i], y: mat.data32S[i + 1] })
  }
  return points
}

async function imageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const imageUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = imageUrl
    })

    const maxSide = 1800
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('无法创建画布上下文')
    }

    ctx.drawImage(image, 0, 0, width, height)
    return canvas
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function findDocumentCorners(cv: OpenCvModule, sourceMat: CvMat): Point[] | null {
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edges = new cv.Mat()
  const morphed = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  let kernel: CvMat | null = null

  try {
    cv.cvtColor(sourceMat, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT)
    cv.Canny(blurred, edges, 60, 180)
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))
    cv.morphologyEx(edges, morphed, cv.MORPH_CLOSE, kernel)

    cv.findContours(morphed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    const imageArea = sourceMat.cols * sourceMat.rows
    let bestPoints: Point[] | null = null
    let bestArea = 0

    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i)
      try {
        const area = cv.contourArea(contour)
        if (area < imageArea * 0.15 || area <= bestArea) {
          continue
        }

        const perimeter = cv.arcLength(contour, true)
        const approx = new cv.Mat()
        try {
          cv.approxPolyDP(contour, approx, 0.02 * perimeter, true)

          if (approx.rows === 4) {
            bestArea = area
            bestPoints = matToPoints(approx)
          }
        } finally {
          approx.delete()
        }
      } finally {
        contour.delete()
      }
    }

    return bestPoints
  } finally {
    gray.delete()
    blurred.delete()
    edges.delete()
    morphed.delete()
    contours.delete()
    hierarchy.delete()
    if (kernel) kernel.delete?.()
  }
}

export async function enhanceDocumentImage(file: File): Promise<DocumentCropResult> {
  const originalPreviewUrl = URL.createObjectURL(file)

  try {
    await loadOpenCv()
    const cv = getOpenCv()
    if (!cv) {
      return {
        originalFile: file,
        originalPreviewUrl,
        processedFile: file,
        processedPreviewUrl: originalPreviewUrl,
        detected: false,
      }
    }

    const canvas = await imageToCanvas(file)
    const sourceMat = cv.imread(canvas)
    let processedBlob: Blob | null = null

    try {
      const corners = findDocumentCorners(cv, sourceMat)
      if (!corners) {
        return {
          originalFile: file,
          originalPreviewUrl,
          processedFile: file,
          processedPreviewUrl: originalPreviewUrl,
          detected: false,
        }
      }

      const [topLeft, topRight, bottomRight, bottomLeft] = orderPoints(corners)
      const widthA = distance(bottomRight, bottomLeft)
      const widthB = distance(topRight, topLeft)
      const maxWidth = Math.max(1, Math.round(Math.max(widthA, widthB)))

      const heightA = distance(topRight, bottomRight)
      const heightB = distance(topLeft, bottomLeft)
      const maxHeight = Math.max(1, Math.round(Math.max(heightA, heightB)))

      const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        topLeft.x,
        topLeft.y,
        topRight.x,
        topRight.y,
        bottomRight.x,
        bottomRight.y,
        bottomLeft.x,
        bottomLeft.y,
      ])
      const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        maxWidth - 1,
        0,
        maxWidth - 1,
        maxHeight - 1,
        0,
        maxHeight - 1,
      ])
      const transform = cv.getPerspectiveTransform(srcTri, dstTri)
      const warped = new cv.Mat()
      const size = new cv.Size(maxWidth, maxHeight)

      try {
        cv.warpPerspective(
          sourceMat,
          warped,
          transform,
          size,
          cv.INTER_LINEAR,
          cv.BORDER_REPLICATE,
          new cv.Scalar(),
        )

        const outputCanvas = document.createElement('canvas')
        outputCanvas.width = maxWidth
        outputCanvas.height = maxHeight
        cv.imshow(outputCanvas, warped)

        processedBlob = await new Promise<Blob | null>((resolve) => {
          outputCanvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92)
        })
      } finally {
        srcTri.delete()
        dstTri.delete()
        transform.delete()
        warped.delete()
      }
    } finally {
      sourceMat.delete()
    }

    if (!processedBlob) {
      return {
        originalFile: file,
        originalPreviewUrl,
        processedFile: file,
        processedPreviewUrl: originalPreviewUrl,
        detected: false,
      }
    }

    const processedFile = new File([processedBlob], file.name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
    })
    const processedPreviewUrl = URL.createObjectURL(processedBlob)

    return {
      originalFile: file,
      originalPreviewUrl,
      processedFile,
      processedPreviewUrl,
      detected: true,
    }
  } catch {
    return {
      originalFile: file,
      originalPreviewUrl,
      processedFile: file,
      processedPreviewUrl: originalPreviewUrl,
      detected: false,
    }
  }
}
