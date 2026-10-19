import React, {useEffect, useRef} from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

interface BarcodeRendererProps {
  code: string;
  type?: 'barcode' | 'qr' | 'both';
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  className?: string;
}

export const BarcodeRenderer: React.FC<BarcodeRendererProps> = ({
  code,
  type = 'barcode',
  format = 'CODE128',
  width = 1.5,
  height = 45,
  displayValue = true,
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Render Barcode
  useEffect(() => {
    if (svgRef.current && (type === 'barcode' || type === 'both') && code) {
      try {
        let selectedFormat = format.toUpperCase();
        // Fallback to CODE128 if EAN13 length is invalid
        if (selectedFormat === 'EAN13' && code.length !== 12 && code.length !== 13) {
          selectedFormat = 'CODE128';
        }
        if (selectedFormat === 'UPC' && code.length !== 11 && code.length !== 12) {
          selectedFormat = 'CODE128';
        }

        JsBarcode(svgRef.current, code, {
          format: selectedFormat,
          width: width,
          height: height,
          displayValue: displayValue,
          fontSize: 12,
          font: 'JetBrains Mono',
          lineColor: '#26201b',
          margin: 4,
          background: 'transparent',
        });
      } catch (err) {
        // Fallback to generic CODE128
        try {
          if (svgRef.current) {
            JsBarcode(svgRef.current, code, {
              format: 'CODE128',
              width: width,
              height: height,
              displayValue: displayValue,
              fontSize: 12,
              font: 'JetBrains Mono',
              lineColor: '#26201b',
              margin: 4,
              background: 'transparent',
            });
          }
        } catch {
          // If still fails, silent error
        }
      }
    }
  }, [code, type, format, width, height, displayValue]);

  // Render QR Code
  useEffect(() => {
    if (qrCanvasRef.current && (type === 'qr' || type === 'both') && code) {
      QRCode.toCanvas(
        qrCanvasRef.current,
        code,
        {
          width: height * 1.6,
          margin: 1,
          color: {
            dark: '#26201b',
            light: '#ffffff00',
          },
        },
        () => {}
      );
    }
  }, [code, type, height]);

  if (!code) {
    return <span className="text-xs text-stone-400 font-mono">No Code</span>;
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-1 ${className}`}>
      {(type === 'barcode' || type === 'both') && (
        <svg ref={svgRef} className="max-w-full overflow-hidden" />
      )}
      {(type === 'qr' || type === 'both') && (
        <canvas ref={qrCanvasRef} className="rounded" />
      )}
    </div>
  );
};
