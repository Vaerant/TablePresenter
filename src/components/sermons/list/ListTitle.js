import React, { useEffect} from 'react';

const ListTitle = ({ data, onPress }) => {  
  return (
    <div className="flex flex-col w-full p-2 border-b border-neutral-700 hover:bg-neutral-900 cursor-pointer" onClick={() => onPress(data)}>
      <h2 className="text-base font-semibold">{data.title}</h2>
      <p className="text-sm text-gray-400">{data.date}</p>
    </div>
  );
};

export default ListTitle;
