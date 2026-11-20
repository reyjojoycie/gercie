import React from 'react';

interface ButtonTestProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

const ButtonTest: React.FC<ButtonTestProps> = ({ children, className, ...props }) => {
  return (
    <button
      className={`
        bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
        dark:bg-blue-700 dark:hover:bg-blue-800
        ${className || ''}
      `}
      {...props}
    >
      {children}
    </button>
  );
};

export default ButtonTest;