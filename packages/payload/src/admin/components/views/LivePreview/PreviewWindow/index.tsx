import React, { useEffect } from 'react'

import type { SanitizedCollectionConfig, SanitizedGlobalConfig } from '../../../../../exports/types'
import type { usePopupWindow } from '../usePopupWindow'

import { useResize } from '../../../../utilities/useResize'
import { useAllFormFields } from '../../../forms/Form/context'
import reduceFieldsToValues from '../../../forms/Form/reduceFieldsToValues'
import { IFrame } from '../PreviewIFrame'
import { EditViewProps } from '../../types'

import { LivePreviewToolbarProvider } from '../ToolbarProvider'
import { useLivePreviewToolbarContext } from '../ToolbarProvider/context'

import './index.scss'

const baseClass = 'live-preview-window'

const ResponsiveWindow: React.FC<{
  children: React.ReactNode
  deviceFrameRef: React.RefObject<HTMLDivElement>
  breakpoints: SanitizedCollectionConfig['admin']['livePreview']['breakpoints']
  breakpoint: string
}> = (props) => {
  const { children, deviceFrameRef, breakpoints, breakpoint } = props

  const { zoom } = useLivePreviewToolbarContext()

  const foundBreakpoint = breakpoint && breakpoints.find((bp) => bp.name === breakpoint)

  let margin = '0'

  if (foundBreakpoint && breakpoint !== 'responsive') {
    margin = '0 auto'

    if (
      typeof zoom === 'number' &&
      typeof foundBreakpoint.width === 'number' &&
      typeof foundBreakpoint.height === 'number'
    ) {
      // keep it centered horizontally
      margin = `0 ${foundBreakpoint.width / 2 / zoom}px`
    }
  }

  return (
    <div
      ref={deviceFrameRef}
      className={`${baseClass}__responsive-window`}
      style={{
        height:
          foundBreakpoint && typeof foundBreakpoint?.height === 'number'
            ? `${foundBreakpoint?.height / (typeof zoom === 'number' ? zoom : 1)}px`
            : typeof zoom === 'number'
            ? `${100 / zoom}%`
            : '100%',
        width:
          foundBreakpoint && typeof foundBreakpoint?.width === 'number'
            ? `${foundBreakpoint?.width / (typeof zoom === 'number' ? zoom : 1)}px`
            : typeof zoom === 'number'
            ? `${100 / zoom}%`
            : '100%',
        margin,
      }}
    >
      {children}
    </div>
  )
}

export const PreviewWindow: React.FC<
  EditViewProps & {
    popupState: ReturnType<typeof usePopupWindow>
    url?: string
  }
> = (props) => {
  const {
    popupState: { isPopupOpen, popupHasLoaded, popupRef },
  } = props

  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const deviceFrameRef = React.useRef<HTMLDivElement>(null)
  const [iframeHasLoaded, setIframeHasLoaded] = React.useState(false)

  let url
  let breakpoints:
    | SanitizedCollectionConfig['admin']['livePreview']['breakpoints']
    | SanitizedGlobalConfig['admin']['livePreview']['breakpoints'] = [
    {
      name: 'responsive',
      height: '100%',
      label: 'Responsive',
      width: '100%',
    },
  ]

  if ('collection' in props) {
    url = props?.collection.admin.livePreview.url
    breakpoints = breakpoints.concat(props?.collection.admin.livePreview.breakpoints)
  }

  if ('global' in props) {
    url = props?.global.admin.livePreview.url
    breakpoints = breakpoints.concat(props?.global.admin.livePreview.breakpoints)
  }

  const [breakpoint, setBreakpoint] = React.useState('responsive')

  const [fields] = useAllFormFields()

  // The preview could either be an iframe embedded on the page
  // Or it could be a separate popup window
  // We need to transmit data to both accordingly
  useEffect(() => {
    if (fields && window && 'postMessage' in window) {
      const values = reduceFieldsToValues(fields)
      const message = JSON.stringify({ data: values, type: 'livePreview' })

      // external window
      if (isPopupOpen) {
        setIframeHasLoaded(false)

        if (popupHasLoaded && popupRef.current) {
          popupRef.current.postMessage(message, url)
        }
      }

      // embedded iframe
      if (!isPopupOpen) {
        if (iframeHasLoaded && iframeRef.current) {
          iframeRef.current.contentWindow?.postMessage(message, url)
        }
      }
    }
  }, [fields, url, iframeHasLoaded, isPopupOpen, popupRef, popupHasLoaded])

  const { size } = useResize(deviceFrameRef)

  if (!isPopupOpen) {
    return (
      <div
        className={[baseClass, isPopupOpen && `${baseClass}--popup-open`].filter(Boolean).join(' ')}
      >
        <div
          className={[
            `${baseClass}__wrapper`,
            breakpoint && breakpoint !== 'responsive' && `${baseClass}__wrapper--has-breakpoint`,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <LivePreviewToolbarProvider
            {...props}
            breakpoint={breakpoint}
            breakpoints={breakpoints}
            deviceSize={size}
            setBreakpoint={setBreakpoint}
            iframeRef={iframeRef}
          >
            <ResponsiveWindow
              deviceFrameRef={deviceFrameRef}
              breakpoints={breakpoints}
              breakpoint={breakpoint}
            >
              <IFrame ref={iframeRef} url={url} setIframeHasLoaded={setIframeHasLoaded} />
            </ResponsiveWindow>
          </LivePreviewToolbarProvider>
        </div>
      </div>
    )
  }
}
