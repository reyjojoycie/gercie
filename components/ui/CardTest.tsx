import React from 'react';

interface CardTestProps {
  title: string;
  text: string;
}

const CardTest: React.FC<CardTestProps> = ({ title, text }) => {
  return (
    <div
      className="w-full md:w-1/2 lg:w-1/3 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-md bg-white dark:bg-gray-800"
    >
      <h2 className="text-xl font-bold mb-2 text-black dark:text-white">{title}</h2>
      <p className="text-base text-gray-700 dark:text-gray-300">{text}</p>
    </div>
  );
};

export default CardTest;