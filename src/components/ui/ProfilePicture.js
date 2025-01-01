import React, { useState } from 'react';
import { User } from 'lucide-react';

const ProfilePicture = ({ src, alt, className = "w-8 h-8 rounded-full" }) => {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      <div className={`bg-gray-200 flex items-center justify-center ${className}`}>
        <User className="text-gray-500" size={20} />
      </div>
    );
  }

  return (
    <img 
      src={src} 
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
};

export default ProfilePicture;