"use client";
import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Menu, Search, X, Home, BookOpen } from 'lucide-react';
import Papa from 'papaparse';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ChapterViewer = () => {
  const [chapters, setChapters] = useState([]);
  const [filteredChapters, setFilteredChapters] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef(null);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQFscVOqoOj_c05nM2zfkQU5pFoUpTTfTdmOGtEJ1gPWMPROzHrBKhHBAvzXrG1CEuZdN34uC65-VHz/pub?gid=0&single=true&output=csv';

  // Touch swipe handling
  const handleTouchStart = (e) => setTouchStart(e.touches[0].clientX);
  const handleTouchMove = (e) => setTouchEnd(e.touches[0].clientX);
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    
    if (isLeftSwipe && currentIndex < filteredChapters.length - 1) {
      goToNext();
    }
    if (isRightSwipe && currentIndex > 0) {
      goToPrevious();
    }
    setTouchEnd(null);
    setTouchStart(null);
  };

  useEffect(() => {
    const fetchChapters = async () => {
      try {
        const response = await fetch(SHEETS_URL);
        const text = await response.text();
        Papa.parse(text, {
          header: true,
          complete: (results) => {
            const validChapters = results.data
              .filter(chapter => chapter.title && chapter.content)
              .map((chapter, index) => ({
                id: index + 1,
                title: chapter.title,
                content: chapter.content,
                tag: chapter.tag || 'Chapter',
                imageUrl: chapter.imageUrl || null
              }));
            setChapters(validChapters);
            setFilteredChapters(validChapters);
            setLoading(false);
          },
          error: (error) => {
            setError('Failed to parse chapters');
            setLoading(false);
          }
        });
      } catch (err) {
        setError('Failed to fetch chapters');
        setLoading(false);
      }
    };
    fetchChapters();
  }, []);

  useEffect(() => {
    const filtered = chapters.filter(chapter =>
      chapter.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chapter.content.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredChapters(filtered);
  }, [searchQuery, chapters]);

  const goToNext = () => {
    if (currentIndex < filteredChapters.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsDrawerOpen(false);
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsDrawerOpen(false);
    }
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === '/') {
        e.preventDefault();
        setShowSearch(true);
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setShowSearch(false);
        setSearchQuery('');
        setIsDrawerOpen(false);
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        goToPrevious();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentIndex]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-xl text-gray-600">Loading chapters...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-xl text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col h-screen bg-gray-50 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-50 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <Menu size={24} />
          </button>
          <div className="text-lg font-semibold truncate px-2">
            Chapter {currentIndex + 1}
          </div>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <Search size={24} />
          </button>
        </div>
        
        {/* Search Bar */}
        {showSearch && (
          <div className="px-4 py-2 border-t">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search chapters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-gray-400"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Chapter Navigation Drawer */}
      <div 
        className={`fixed inset-y-0 left-0 transform ${
          isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        } w-64 bg-white shadow-lg transition-transform duration-200 ease-in-out z-50`}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Chapters</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredChapters.map((chapter, index) => (
              <button
                key={chapter.id}
                onClick={() => {
                  setCurrentIndex(index);
                  setIsDrawerOpen(false);
                }}
                className={`w-full px-4 py-3 text-left hover:bg-gray-100 ${
                  index === currentIndex ? 'bg-blue-50 text-blue-600' : ''
                }`}
              >
                <div className="font-medium">Chapter {index + 1}</div>
                <div className="text-sm text-gray-600 truncate">
                  {chapter.title}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4">
          <h1 className="text-2xl font-bold mb-4">
            {filteredChapters[currentIndex].title}
          </h1>
          <div className="prose prose-sm sm:prose max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {filteredChapters[currentIndex].content}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div className="sticky bottom-0 bg-white border-t shadow-lg">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={goToPrevious}
            disabled={currentIndex === 0}
            className={`p-2 rounded-lg ${
              currentIndex === 0 ? 'text-gray-300' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ChevronLeft size={24} />
          </button>
          <div className="text-sm text-gray-600">
            {currentIndex + 1} / {filteredChapters.length}
          </div>
          <button
            onClick={goToNext}
            disabled={currentIndex === filteredChapters.length - 1}
            className={`p-2 rounded-lg ${
              currentIndex === filteredChapters.length - 1 
                ? 'text-gray-300' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </div>

      {/* Overlay for drawer */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}
    </div>
  );
};

export default ChapterViewer;
