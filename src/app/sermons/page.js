'use client';

import { useState, useMemo, useEffect } from 'react';
// import allSermons from '@/data/sermon_data/all_sermons.json';
import useSermonStore from '@/stores/sermonStore';

import ListTitle from '@/components/sermon/ListTitle';
import SermonView from '@/components/sermons/full/SermonView';

// import { sermonSearch } from '@/lib/sermonSearch';

export default function Home() {
  console.log('Rendering Home component');
  // const { activeSermon, setActiveSermon } = useSermonStore();

  // const [allSermons, setAllSermons] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSermonData, setSelectedSermonData] = useState(null);

  useEffect(() => {
    console.log('fetchSermons called');
    // const fetchSermons = async () => {
    //   console.log('Fetching sermons...');
    //   const sermons = await sermonSearch.getSermons();
    //   console.log('Fetched Sermons:', sermons);
    //   setAllSermons(sermons);
    // };
    // fetchSermons();
  }, []);

  const filteredSermons = useMemo(() => {
    return [];
    if (!allSermons) return [];
    if (!searchTerm) return allSermons;
    return allSermons.filter(sermon =>
      sermon.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sermon.date.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
  }, [searchTerm]);

  // const handleSermonPress = async (sermon) => {
  //   const sermonData = await sermonSearch.loadSermon(sermon.uid);
  //   setSelectedSermonData(sermonData);
  //   console.log('Selected Sermon:', sermonData);
  // };

  return (
    <div className="min-h-screen bg-black text-white flex">
      <div className='w-[40vw] flex flex-col max-h-screen'>
        <input
          type="text"
          placeholder="Search sermons..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border border-gray-700 rounded bg-neutral-900 text-white"
        />
        {/* <div className="flex flex-col overflow-y-auto grow">
          {filteredSermons.map((sermon, index) => (
            <ListTitle key={index} data={sermon} onPress={handleSermonPress} />
          ))}
        </div> */}
      </div>
      {/* <SermonView sermonData={selectedSermonData} /> */}
    </div>
  );
}