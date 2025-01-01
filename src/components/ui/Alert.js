import React from 'react';

export const Alert = ({ children, variant = 'default', className = '' }) => {
  const variantStyles = {
    default: 'bg-blue-50 text-blue-700 border-blue-200',
    destructive: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className={`p-4 rounded-lg border ${variantStyles[variant]} ${className}`} role="alert">
      {children}
    </div>
  );
};

export const AlertDescription = ({ children, className = '' }) => {
  return (
    <div className={`text-sm mt-1 ${className}`}>
      {children}
    </div>
  );
};