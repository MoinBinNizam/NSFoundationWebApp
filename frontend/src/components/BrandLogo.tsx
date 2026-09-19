import React, { useRef, useState } from 'react';
import { useLogo } from '../context/LogoContext';
import { Camera, Building2, Trash2 } from 'lucide-react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  editable?: boolean;
  className?: string;
  altText?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  editable = false,
  className = '',
  altText = 'NS Foundation Logo',
}) => {
  const { logo, uploadLogo, resetLogo } = useLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const sizeClasses = {
    sm: 'w-7 h-7 rounded-lg text-xs',
    md: 'w-9 h-9 rounded-xl text-sm',
    lg: 'w-12 h-12 rounded-xl text-base',
    xl: 'w-16 h-16 rounded-2xl text-xl',
  };

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 26,
    xl: 32,
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    try {
      await uploadLogo(file);
    } catch (err: unknown) {
      setUploadError((err as Error).message || 'Failed to upload logo');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="relative inline-block group">
      <div
        onClick={() => editable && fileInputRef.current?.click()}
        className={`relative overflow-hidden flex items-center justify-center shrink-0 border border-white/10 shadow-md ${sizeClasses[size]} ${
          editable ? 'cursor-pointer' : ''
        } ${className}`}
        title={editable ? 'Click to upload NS Foundation Logo' : altText}
      >
        {logo ? (
          <img
            src={logo}
            alt={altText}
            className="w-full h-full object-cover rounded-inherit"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-600 via-indigo-600 to-emerald-600 flex items-center justify-center text-white font-extrabold tracking-wider">
            {size === 'sm' || size === 'md' ? (
              <span className="select-none text-[11px] font-black">NS</span>
            ) : (
              <Building2 size={iconSizes[size]} className="text-white drop-shadow-sm" />
            )}
          </div>
        )}

        {/* Hover overlay for editable logo */}
        {editable && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white backdrop-blur-[2px]">
            <Camera size={iconSizes[size] * 0.65} className="drop-shadow" />
          </div>
        )}
      </div>

      {/* Hidden file input */}
      {editable && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* If logo is set, offer quick reset button on hover in larger sizes */}
          {logo && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                resetLogo();
              }}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-600 hover:bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
              title="Reset to default logo"
            >
              <Trash2 size={9} />
            </button>
          )}
        </>
      )}

      {uploadError && (
        <span className="absolute left-0 -bottom-5 text-[10px] text-rose-400 whitespace-nowrap bg-gray-900 px-1.5 py-0.5 rounded border border-rose-500/30">
          {uploadError}
        </span>
      )}
    </div>
  );
};
