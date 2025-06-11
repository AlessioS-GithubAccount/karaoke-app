import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListaCanzoniComponent } from './lista-canzoni.component';

describe('ListaCanzoniComponent', () => {
  let component: ListaCanzoniComponent;
  let fixture: ComponentFixture<ListaCanzoniComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ListaCanzoniComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ListaCanzoniComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
